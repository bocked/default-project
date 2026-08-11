import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { hashTelegramVerifyToken } from "../../src/lib/tokens.js";
import { startTestServer, cleanDatabase, request, unique, type TestServer } from "./helpers.js";

const WEBHOOK_SECRET = "test-webhook-secret";
const CHAT_ID = 555000111;

function startUpdate(token: string, chatId: number, messageId = 1) {
  return {
    message: {
      message_id: messageId,
      text: `/start verify_${token}`,
      chat: { id: chatId },
    },
  };
}

function contactUpdate(chatId: number, phone: string, messageId = 2) {
  return {
    message: {
      message_id: messageId,
      chat: { id: chatId },
      contact: {
        phone_number: phone,
        first_name: "Test",
        user_id: chatId,
      },
    },
  };
}

describe("E2E: Telegram phone verification flow (/start verify_... then contact)", () => {
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

  it("links a session on /start verify_<token> and stores phone + code on contact", async () => {
    const email = `${unique("tgv")}@example.com`;
    const token = "0".repeat(32); // must stay within Telegram's 64-char payload limit

    await prisma.user.create({
      data: {
        email,
        passwordHash: "x",
        telegramVerifyToken: hashTelegramVerifyToken(token),
        telegramVerifyExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const start = await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: startUpdate(token, CHAT_ID),
    });
    expect(start.status).toBe(200);

    const afterStart = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(afterStart.telegramVerifyChatId).toBe(String(CHAT_ID));

    const contact = await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: contactUpdate(CHAT_ID, "+998901234567"),
    });
    expect(contact.status).toBe(200);

    const afterContact = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(afterContact.telegramId).toBe(String(CHAT_ID));
    expect(afterContact.phoneNumber).toBe("+998901234567");
    expect(afterContact.phoneVerified).toBe(false);
    expect(afterContact.telegramVerifyCode).toBeTruthy();
    expect(afterContact.telegramVerifyCodeExpiresAt).toBeTruthy();
    expect(afterContact.telegramVerifyChatId).toBeNull();
  });

  it("accepts a manually attached contact (no user_id) as well", async () => {
    const email = `${unique("tgv3")}@example.com`;
    const token = "b".repeat(32);
    const chatId = 555000333;

    await prisma.user.create({
      data: {
        email,
        passwordHash: "x",
        telegramVerifyToken: hashTelegramVerifyToken(token),
        telegramVerifyExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: startUpdate(token, chatId),
    });
    const contact = await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: {
        message: {
          message_id: 2,
          chat: { id: chatId },
          contact: { phone_number: "+998905556677", first_name: "Test" }, // no user_id
        },
      },
    });
    expect(contact.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(after.telegramId).toBe(String(chatId));
    expect(after.phoneNumber).toBe("+998905556677");
    expect(after.telegramVerifyCode).toBeTruthy();
  });

  it("handles a contact delivered as a reply to the bot's request message", async () => {
    const email = `${unique("tgv4")}@example.com`;
    const token = "c".repeat(32);
    const chatId = 555000444;

    await prisma.user.create({
      data: {
        email,
        passwordHash: "x",
        telegramVerifyToken: hashTelegramVerifyToken(token),
        telegramVerifyExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: startUpdate(token, chatId),
    });
    const contact = await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: {
        message: {
          message_id: 2,
          chat: { id: chatId },
          contact: { phone_number: "+998907778899", first_name: "Test", user_id: chatId },
          reply_to_message: { message_id: 1, text: "Telefon raqamingizni yuboring" },
        },
      },
    });
    expect(contact.status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(after.telegramId).toBe(String(chatId));
    expect(after.phoneNumber).toBe("+998907778899");
    expect(after.telegramVerifyCode).toBeTruthy();
  });

  it("does not accept a contact from a chat without an active session", async () => {
    const before = await prisma.user.count();
    const contact = await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: contactUpdate(999111222, "+998901112233"),
    });
    expect(contact.status).toBe(200);
    expect(await prisma.user.count()).toBe(before);
  });

  it("rejects sharing a Telegram account already linked to another profile", async () => {
    const chatId = 555000222;
    const email = `${unique("tgl")}@example.com`;
    const token = "a".repeat(32);

    // Another user already owns this Telegram chat.
    await prisma.user.create({
      data: { email, passwordHash: "x", telegramId: String(chatId) },
    });

    // A second user starts a fresh verification session from that same chat.
    const email2 = `${unique("tgv2")}@example.com`;
    await prisma.user.create({
      data: {
        email: email2,
        passwordHash: "x",
        telegramVerifyToken: hashTelegramVerifyToken(token),
        telegramVerifyExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: startUpdate(token, chatId),
    });

    const contact = await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: contactUpdate(chatId, "+998901234567"),
    });
    expect(contact.status).toBe(200);

    // The Telegram chat must stay with its original owner.
    const owner = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(owner.telegramId).toBe(String(chatId));
    const blocked = await prisma.user.findUniqueOrThrow({ where: { email: email2 } });
    expect(blocked.telegramId).toBeNull();
    expect(blocked.phoneNumber).toBeNull();
    expect(blocked.telegramVerifyChatId).toBe(String(chatId));
  });
});
