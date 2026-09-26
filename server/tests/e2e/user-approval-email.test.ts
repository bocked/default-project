import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { emailTranscript } from "../../src/lib/email.js";
import { startTestServer, cleanDatabase, request, unique, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

const WEBHOOK_SECRET = "test-webhook-secret";
const ADMIN_CHAT_ID = 899933314; // pinned by vitest.e2e.config.ts

function approvedMails(to: string) {
  return emailTranscript.filter((r) => r.to === to && r.type === "USER_APPROVED");
}

describe("E2E: Approval email notification (isSuperApproved)", () => {
  let ts: TestServer;
  let base: string;

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
  });

  afterAll(async () => {
    await ts.close();
  });

  it("Super Admin panel approval emails the user and audits the action", async () => {
    const email = `${unique("aem")}@example.com`;
    const reg = await request(base, "POST", "/api/auth/register", {
      body: { email, password: "s3cret-password" },
    });
    expect(reg.status).toBe(201);
    const userId = reg.json.user.id;

    const approve = await request(base, "POST", `/api/admin/users/${userId}/super-approve`, { token: ADMIN_PASSWORD });
    expect(approve.status).toBe(200);

    const mails = approvedMails(email);
    expect(mails.length).toBe(1);
    expect(mails[0].subject).toBe("Akkountingiz muvaffaqiyatli tasdiqlandi! 🎉");
    expect(mails[0].text).toContain("Xush kelibsiz!");
    expect(mails[0].text).toContain("Super Admin tomonidan tasdiqlandi");

    const audits = await request(base, "GET", "/api/admin/audit-logs", { token: ADMIN_PASSWORD });
    expect(audits.status).toBe(200);
    const entry = audits.json.logs.find((l: any) => l.action === "user.super-approve" && l.targetId === userId);
    expect(entry).toBeTruthy();
    expect(entry.detail).toBe(email);
  });

  it("approval-bot inbox [Tasdiqlash] emails the approved user", async () => {
    const email = `${unique("aemc")}@example.com`;
    const user = await prisma.user.create({ data: { email, passwordHash: "x" } });

    const res = await request(base, "POST", "/api/telegram/webhook/approval", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: {
        callback_query: {
          id: "cq-ae-1",
          data: `approve-user:${user.id}`,
          message: { message_id: 2, chat: { id: ADMIN_CHAT_ID } },
        },
      },
    });
    expect(res.status).toBe(200);
    expect(approvedMails(email).length).toBe(1);
  });

  it("verify command emails once and never again for an already-approved user", async () => {
    const email = `${unique("aemv")}@example.com`;
    const user = await prisma.user.create({ data: { email, passwordHash: "x" } });

    const verify = (text: string) =>
      request(base, "POST", "/api/telegram/webhook/approval", {
        headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
        body: { message: { message_id: 3, text, chat: { id: ADMIN_CHAT_ID } } },
      });

    expect((await verify(`verify ${email}`)).status).toBe(200);
    expect(approvedMails(email).length).toBe(1);

    // Idempotent: a second verify must not spam another approval mail.
    expect((await verify(`verify ${email}`)).status).toBe(200);
    expect(approvedMails(email).length).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isSuperApproved).toBe(true);
  });
});