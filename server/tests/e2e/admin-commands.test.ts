import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { executeAdminCommand } from "../../src/lib/adminCommands.js";
import { startTestServer, cleanDatabase, request, unique } from "./helpers.js";

const WEBHOOK_SECRET = "test-webhook-secret";
const ADMIN_CHAT_ID = 899933314; // pinned by vitest.e2e.config.ts

describe("E2E: Telegram admin prompt commands", () => {
  let ts: Awaited<ReturnType<typeof startTestServer>>;
  let base: string;

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
  });

  afterAll(async () => {
    await ts.close();
  });

  async function postCommand(text: string, chatId = ADMIN_CHAT_ID): Promise<{ status: number }> {
    const res = await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: { message: { message_id: 100, text, chat: { id: chatId } } },
    });
    return res;
  }

  async function makeUser(prefix: string, extra: Record<string, unknown> = {}) {
    return prisma.user.create({
      data: { email: `${unique(prefix)}@example.com`, passwordHash: "x", ...extra },
    });
  }

  async function makeQuote(userId: string, extra: Record<string, unknown> = {}) {
    const category = await prisma.category.create({ data: { name: `Bo'lim ${unique("cat")}`, slug: unique("cat") } });
    return prisma.quote.create({
      data: {
        text: `Test iqtibos ${unique("q")}`,
        displayAuthor: "Anonim",
        anonymous: true,
        categoryId: category.id,
        userId,
        ...extra,
      },
    });
  }

  it("stores a new TELEGRAM announcement from `elon`", async () => {
    const res = await postCommand("elon Yangi imkoniyat | Endi VIP foydalanuvchilar uchun yangi uslublar.");
    expect(res.status).toBe(200);
    const a = await prisma.announcement.findFirst({ orderBy: { createdAt: "desc" } });
    expect(a).toBeTruthy();
    expect(a!.title).toBe("Yangi imkoniyat");
    expect(a!.message).toContain("VIP");
    expect(a!.channel).toBe("TELEGRAM");
    expect(a!.status).toBe("ACTIVE");
  });

  it("approves a pending quote via `approve <id>`", async () => {
    const user = await makeUser("acq");
    const quote = await makeQuote(user.id);

    const res = await postCommand(`approve ${quote.id}`);
    expect(res.status).toBe(200);

    const updated = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(updated.status).toBe("APPROVED");
    expect(updated.awaitingRejection).toBe(false);
  });

  it("rejects a pending quote with a reason via `rad et <id> <sabab>`", async () => {
    const user = await makeUser("acr");
    const quote = await makeQuote(user.id);

    const res = await postCommand(`rad et ${quote.id} yolg'on ma'lumot`);
    expect(res.status).toBe(200);

    const updated = await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } });
    expect(updated.status).toBe("REJECTED");
    expect(updated.rejectionReason).toBe("yolg'on ma'lumot");
  });

  it("verifies a user via `verify <email>` and revokes via `verify off`", async () => {
    const user = await makeUser("acv");

    expect((await postCommand(`verify ${user.email}`)).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isSuperApproved).toBe(true);

    expect((await postCommand(`verify off ${user.email}`)).status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.isSuperApproved).toBe(false);
    expect(after.superApprovedAt).toBeNull();
  });

  it("blocks and unblocks a user but never an admin", async () => {
    const user = await makeUser("acb");
    const admin = await makeUser("acad", { role: "ADMIN" });

    await postCommand(`blokla ${user.email}`);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).blocked).toBe(true);

    await postCommand(`blokla ${admin.email}`);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).blocked).toBe(false);

    await postCommand(`och ${user.email}`);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).blocked).toBe(false);
  });

  it("grants and revokes VIP", async () => {
    const user = await makeUser("acvip");

    await postCommand(`vip ${user.email} 30`);
    const granted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(granted.isPremium).toBe(true);
    expect(granted.premiumExpiresAt).toBeTruthy();
    expect(granted.premiumExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 20 * 24 * 3600 * 1000);

    await postCommand(`vip off ${user.email}`);
    const revoked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(revoked.isPremium).toBe(false);
    expect(revoked.premiumExpiresAt).toBeNull();
  });

  it("bans and unbans an IP", async () => {
    await postCommand("ban 203.0.113.7 spam bot");
    expect(await prisma.bannedIp.findUnique({ where: { ipAddress: "203.0.113.7" } })).toBeTruthy();

    await postCommand("unban 203.0.113.7");
    expect(await prisma.bannedIp.findUnique({ where: { ipAddress: "203.0.113.7" } })).toBeNull();
  });

  it("ignores plain text from non-admin chats", async () => {
    const user = await makeUser("acna");
    const quote = await makeQuote(user.id);

    const res = await postCommand(`approve ${quote.id}`, 555999111);
    expect(res.status).toBe(200);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("PENDING");
  });

  it("returns a ✓ summary for completed tasks and guidance for unknown ones", async () => {
    const user = await makeUser("acx");
    const quote = await makeQuote(user.id);

    const done = await executeAdminCommand(`approve ${quote.id}`);
    expect(done).toContain("✓ Topshiriq bajarildi");
    expect(done).toContain(quote.id.slice(0, 8));

    const second = await makeQuote(user.id);
    const rejected = await executeAdminCommand(`rad et ${second.id} dublikat`);
    expect(rejected).toContain("✓ Topshiriq bajarildi");

    const unknown = await executeAdminCommand("salom nima gap");
    expect(unknown).toContain("tan olinmadi");
    expect(unknown).not.toContain("✓ Topshiriq bajarildi");

    const invalid = await executeAdminCommand("rad et abc123");
    expect(invalid).toContain("✗");
  });

  it("rejects webhook calls without the secret token", async () => {
    const res = await fetch(`${base}/api/telegram/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: { message_id: 1, text: "stats", chat: { id: ADMIN_CHAT_ID } } }),
    });
    expect(res.status).toBe(401);
  });
});