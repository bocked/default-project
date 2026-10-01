import { prisma } from "./prisma.js";
import type { Quote, QuoteStatus } from "@prisma/client";

/**
 * Atomic moderation transitions for quotes.
 *
 * Approving/rejecting used to be a read-then-write: the handler read the row to
 * learn `status`, derived "was it PENDING?" from that snapshot, then issued an
 * unconditional `update({ where: { id } })`. Two concurrent requests - a
 * double-tapped admin button, an admin panel plus a Telegram moderation button at
 * the same time, or an automatic client retry of a request whose response was
 * lost in transit - could both observe `PENDING` and both run the side effects:
 * two moderation emails to the author, two audit rows, and (on the first
 * approval) two copies of the quote posted to the public Telegram channel.
 *
 * The fix is a compare-and-swap: the UPDATE carries the status that was actually
 * observed in the `where` clause, so the database itself decides the winner. A
 * loser gets `count === 0`, re-reads and either recognises the decision as already
 * applied (idempotent no-op, no duplicate side effects) or retries against the
 * new state. This keeps the intentional admin workflow of flipping a quote back
 * from REJECTED to APPROVED working, while making a repeated or concurrent
 * decision for the *same* target state a no-op.
 */

export type ModerationOutcome =
  /** No such quote. */
  | { kind: "not-found" }
  /** This caller performed the state change and owns the side effects. */
  | { kind: "transitioned"; quote: Quote }
  /** The quote was already in the requested state; nothing to do, no side effects. */
  | { kind: "already-applied"; quote: Quote }
  /** Contended writes kept bouncing; the caller should retry the request. */
  | { kind: "conflict" };

/** Bounded CAS retries. Real contention here is a human double-click, so 3 is ample. */
const CAS_ATTEMPTS = 3;

export async function applyModerationDecision(
  id: string,
  decision: Extract<QuoteStatus, "APPROVED" | "REJECTED">,
  options: { rejectionReason?: string } = {},
): Promise<ModerationOutcome> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const current = await prisma.quote.findUnique({ where: { id } });
    if (!current) return { kind: "not-found" };
    if (current.status === decision) return { kind: "already-applied", quote: current };

    const data =
      decision === "APPROVED"
        ? { status: "APPROVED" as const, awaitingRejection: false, rejectionReason: null }
        : {
            status: "REJECTED" as const,
            awaitingRejection: false,
            rejectionReason: options.rejectionReason ?? null,
          };

    // The observed status in the predicate is what makes this safe: if a
    // competing request changed the row after our read, this matches nothing.
    const claimed = await prisma.quote.updateMany({
      where: { id, status: current.status },
      data,
    });
    if (claimed.count === 1) return { kind: "transitioned", quote: current };
    // Lost the race: loop, re-read, and either no-op or claim the new state.
  }
  return { kind: "conflict" };
}

/**
 * Claims the right to auto-publish a freshly approved quote to the Telegram
 * channel.
 *
 * The publish itself is an external side effect that cannot participate in a
 * database transaction, so it is guarded by claiming the `telegramPostedAt`
 * marker with a conditional update first: only the caller whose update matches a
 * row that is still unpublished may post. If the channel call fails, the claim is
 * released (matched on the exact timestamp we wrote) so a later approval can
 * retry instead of being permanently suppressed.
 *
 * Returns the claim token when the caller won the claim and must publish, or
 * null when someone else already holds it. The token is the exact timestamp
 * written, so the release can only ever undo its own claim.
 */
export async function claimTelegramPublish(quoteId: string): Promise<Date | null> {
  const stamp = new Date();
  const claimed = await prisma.quote.updateMany({
    where: { id: quoteId, telegramPostedAt: null },
    data: { telegramPostedAt: stamp },
  });
  return claimed.count === 1 ? stamp : null;
}

/** Releases a claim taken by {@link claimTelegramPublish} after a failed publish. */
export async function releaseTelegramPublish(quoteId: string, stamp: Date): Promise<void> {
  await prisma.quote.updateMany({
    where: { id: quoteId, telegramPostedAt: stamp },
    data: { telegramPostedAt: null },
  });
}