import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { applyModerationDecision } from "../../src/lib/quoteModeration.js";
import { startTestServer, cleanDatabase, request, unique, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

/**
 * Regression coverage for the concurrency fixes in the last audit.
 *
 * These are the failures that cannot be reproduced by clicking a button once, so
 * each test drives the exact interleaving that used to misbehave: two requests
 * arriving together, or the same logical request replayed after its response was
 * lost in transit.
 */

async function makeQuote(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `${unique("race")}@example.com`,
      passwordHash: null,
      nickname: "race",
      role: "USER",
    },
  });
  const category = await prisma.category.findFirstOrThrow();
  const quote = await prisma.quote.create({
    data: { text: "Iqtibos", displayAuthor: "Muallif", userId: user.id, categoryId: category.id },
  });
  return quote.id;
}

describe("E2E: race-condition and replay hardening", () => {
  let ts: TestServer;
  let base: string;

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
    await prisma.category.create({ data: { name: "Motivatsiya", slug: "motivatsiya" } });
  });

  afterAll(async () => {
    await ts.close();
  });

  beforeEach(async () => {
    await prisma.quote.deleteMany();
    await prisma.user.deleteMany({ where: { email: { contains: "race" } } });
    await prisma.category.deleteMany();
    await prisma.category.create({ data: { name: "Motivatsiya", slug: "motivatsiya" } });
  });

  describe("quote moderation compare-and-swap", () => {
    it("lets only one of two concurrent approvals perform the transition", async () => {
      const id = await makeQuote();

      // Fire both transitions without awaiting between them, so they race.
      const [a, b] = await Promise.all([
        applyModerationDecision(id, "APPROVED"),
        applyModerationDecision(id, "APPROVED"),
      ]);

      const transitioned = [a, b].filter((o) => o.kind === "transitioned");
      expect(transitioned).toHaveLength(1);
      // The loser must be a clean no-op, never a second state change.
      expect([a, b].some((o) => o.kind === "already-applied")).toBe(true);
      expect(await prisma.quote.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "APPROVED" });
    });

    it("keeps the intentional flip-back from REJECTED to APPROVED working", async () => {
      const id = await makeQuote();
      expect((await applyModerationDecision(id, "REJECTED", { rejectionReason: "manba yo'q" })).kind).toBe("transitioned");
      // A deliberate moderation change of mind must still move the row.
      expect((await applyModerationDecision(id, "APPROVED")).kind).toBe("transitioned");
      expect(await prisma.quote.findUniqueOrThrow({ where: { id } })).toMatchObject({
        status: "APPROVED",
        rejectionReason: null,
      });
    });

    it("reports not-found instead of throwing for a missing quote", async () => {
      expect((await applyModerationDecision("00000000-0000-0000-0000-000000000000", "APPROVED")).kind).toBe("not-found");
    });

    it("does not double-notify when the approve endpoint is called twice", async () => {
      const id = await makeQuote();
      const first = await request(base, "POST", `/api/admin/quotes/${id}/approve`, { token: ADMIN_PASSWORD });
      const second = await request(base, "POST", `/api/admin/quotes/${id}/approve`, { token: ADMIN_PASSWORD });

      // Idempotent success: a retried request must not look like a failure.
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await prisma.quote.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "APPROVED" });
    });
  });

  describe("idempotency replay", () => {
    it("replays the first outcome for a repeated X-Idempotency-Key", async () => {
      const id = await makeQuote();
      const headers = { "X-Idempotency-Key": `k-${unique("idem")}` };

      const first = await request(base, "POST", `/api/admin/quotes/${id}/approve`, {
        token: ADMIN_PASSWORD,
        headers,
      });
      expect(first.status).toBe(200);

      // Flip the row back so a real second execution would be observable.
      await prisma.quote.update({ where: { id }, data: { status: "PENDING" } });

      const replay = await request(base, "POST", `/api/admin/quotes/${id}/approve`, {
        token: ADMIN_PASSWORD,
        headers,
      });
      expect(replay.status).toBe(200);
      expect(replay.json).toEqual(first.json);
      // Still PENDING => the handler did not run a second time.
      expect((await prisma.quote.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    });

    it("does not let one caller's key suppress a different caller's request", async () => {
      const id = await makeQuote();
      const key = `k-${unique("scoped")}`;
      const first = await request(base, "POST", `/api/admin/quotes/${id}/approve`, {
        token: ADMIN_PASSWORD,
        headers: { "X-Idempotency-Key": key },
      });
      expect(first.status).toBe(200);

      await prisma.quote.update({ where: { id }, data: { status: "PENDING" } });
      // Same key, different Authorization header => different scope, real run.
      const other = await request(base, "POST", `/api/admin/quotes/${id}/approve`, {
        token: ADMIN_PASSWORD,
        headers: { "X-Idempotency-Key": key, "X-Forwarded-For": "203.0.113.9" },
      });
      expect(other.status).toBe(200);
      expect((await prisma.quote.findUniqueOrThrow({ where: { id } })).status).toBe("APPROVED");
    });
  });

  describe("last SUPER_ADMIN guard", () => {
    it("refuses to demote the only remaining SUPER_ADMIN", async () => {
      const victim = await prisma.user.create({
        data: { email: `${unique("sole")}@example.com`, passwordHash: null, nickname: "sole", role: "SUPER_ADMIN" },
      });

      const res = await request(base, "PATCH", `/api/admin/users/${victim.id}/role`, {
        token: ADMIN_PASSWORD,
        body: { role: "USER" },
      });

      expect(res.status).toBe(409);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).role).toBe("SUPER_ADMIN");

      await prisma.user.delete({ where: { id: victim.id } });
    });

    it("allows the demotion once a second SUPER_ADMIN exists", async () => {
      const a = await prisma.user.create({
        data: { email: `${unique("duo")}@example.com`, passwordHash: null, nickname: "duo-a", role: "SUPER_ADMIN" },
      });
      const b = await prisma.user.create({
        data: { email: `${unique("duo")}@example.com`, passwordHash: null, nickname: "duo-b", role: "SUPER_ADMIN" },
      });

      const res = await request(base, "PATCH", `/api/admin/users/${a.id}/role`, {
        token: ADMIN_PASSWORD,
        body: { role: "USER" },
      });

      expect(res.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).role).toBe("USER");
      // The survivor is untouched and still an escalation path back.
      expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).role).toBe("SUPER_ADMIN");

      await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    });
  });
});