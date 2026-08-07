import { prisma } from "./prisma.js";
import { bus } from "./bus.js";

/**
 * Records an item edit into the ItemEdit history table and publishes a live
 * `canvas:activity` event for the activity feed. Moves are recorded for history
 * but skipped in the live broadcast to avoid flooding the feed.
 */
export async function recordItemEdit(opts: {
  itemId: string;
  action: string;
  snapshot: unknown;
  actorId?: string | null;
  actorName?: string | null;
  broadcast?: boolean;
}): Promise<void> {
  try {
    const edit = await prisma.itemEdit.create({
      data: {
        itemId: opts.itemId,
        action: opts.action,
        snapshot: JSON.stringify(opts.snapshot),
        actorId: opts.actorId ?? null,
        actorName: opts.actorName ?? null,
      },
    });
    if (opts.broadcast === false || opts.action === "move") return;
    const item = await prisma.canvasItem.findUnique({
      where: { id: opts.itemId },
      select: { type: true, content: true, roomId: true },
    });
    if (!item) return;
    await bus.publish("canvas:activity", {
      id: edit.id,
      action: opts.action,
      itemId: opts.itemId,
      itemType: item.type,
      preview: item.content.slice(0, 120),
      actorName: opts.actorName ?? null,
      at: edit.at.toISOString(),
      roomId: item.roomId,
    });
  } catch {
    /* activity is best-effort */
  }
}
