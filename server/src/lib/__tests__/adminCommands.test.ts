import { describe, expect, it } from "vitest";
import { parseAdminCommand, executeUserApprovalCommand } from "../adminCommands.js";

describe("parseAdminCommand", () => {
  describe("queries", () => {
    it("parses help aliases", () => {
      expect(parseAdminCommand("help").kind).toBe("help");
      expect(parseAdminCommand("/yordam").kind).toBe("help");
      expect(parseAdminCommand("YORDAM").kind).toBe("help");
    });

    it("parses stats aliases", () => {
      expect(parseAdminCommand("stats").kind).toBe("stats");
      expect(parseAdminCommand("/statistika").kind).toBe("stats");
    });

    it("parses pending aliases", () => {
      expect(parseAdminCommand("pending").kind).toBe("pending");
      expect(parseAdminCommand("kutmoqda").kind).toBe("pending");
    });

    it("parses users aliases", () => {
      expect(parseAdminCommand("users").kind).toBe("users");
      expect(parseAdminCommand("/foydalanuvchilar").kind).toBe("users");
    });

    it("parses quote info", () => {
      const c = parseAdminCommand("sitata abc-123");
      expect(c).toEqual({ kind: "quoteInfo", quoteId: "abc-123" });
    });
  });

  describe("approve / verify dispatch", () => {
    it("routes an id to quote approve", () => {
      expect(parseAdminCommand("approve 550e8400-e29b-41d4-a716-446655440000")).toEqual({
        kind: "approve",
        quoteId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(parseAdminCommand("tasdiqla 42").kind).toBe("approve");
    });

    it("routes an email to user verify", () => {
      expect(parseAdminCommand("approve User@Example.COM")).toEqual({ kind: "verify", email: "user@example.com" });
      expect(parseAdminCommand("tasdiqla user@example.com").kind).toBe("verify");
    });

    it("rejects an empty target", () => {
      const c = parseAdminCommand("approve");
      expect(c.kind).toBe("invalid");
    });
  });

  describe("reject", () => {
    it("parses reason after the id", () => {
      expect(parseAdminCommand("reject abc12 nomaqbul mazmun")).toEqual({
        kind: "reject",
        quoteId: "abc12",
        reason: "nomaqbul mazmun",
      });
    });

    it("accepts the Uzbek rad et form", () => {
      expect(parseAdminCommand("rad et abc12 spam")).toEqual({ kind: "reject", quoteId: "abc12", reason: "spam" });
      expect(parseAdminCommand("RAD ET 7 yolg'on ma'lumot")).toEqual({ kind: "reject", quoteId: "7", reason: "yolg'on ma'lumot" });
    });

    it("requires a reason", () => {
      const c = parseAdminCommand("reject abc12");
      expect(c.kind).toBe("invalid");
    });
  });

  describe("users block/unblock", () => {
    it("parses block by email", () => {
      expect(parseAdminCommand("blokla bad@user.com")).toEqual({ kind: "block", email: "bad@user.com" });
      expect(parseAdminCommand("block x@y.uz")).toEqual({ kind: "block", email: "x@y.uz" });
    });

    it("parses unblock by email", () => {
      expect(parseAdminCommand("och bad@user.com")).toEqual({ kind: "unblock", email: "bad@user.com" });
      expect(parseAdminCommand("unblock bad@USER.com")).toEqual({ kind: "unblock", email: "bad@user.com" });
    });

    it("complains when the email is missing", () => {
      expect(parseAdminCommand("blokla").kind).toBe("invalid");
      expect(parseAdminCommand("blokla not-an-email").kind).toBe("invalid");
    });
  });

  describe("VIP", () => {
    it("defaults to 30 days when no duration is given", () => {
      expect(parseAdminCommand("vip user@example.com")).toEqual({ kind: "vip", email: "user@example.com", days: null });
      expect(parseAdminCommand("/premium User@Example.com")).toEqual({ kind: "vip", email: "user@example.com", days: null });
    });

    it("parses a day count bounded to 3650", () => {
      expect(parseAdminCommand("vip user@example.com 7")).toEqual({ kind: "vip", email: "user@example.com", days: 7 });
      expect(parseAdminCommand("vip user@example.com 99999")).toEqual({ kind: "vip", email: "user@example.com", days: 3650 });
    });

    it("parses lifetime", () => {
      expect(parseAdminCommand("vip user@example.com umrbod")).toEqual({ kind: "vip", email: "user@example.com", days: "lifetime" });
    });

    it("parses revoke", () => {
      expect(parseAdminCommand("vip off user@example.com")).toEqual({ kind: "vipOff", email: "user@example.com" });
      expect(parseAdminCommand("vip ochir user@example.com")).toEqual({ kind: "vipOff", email: "user@example.com" });
    });

    it("rejects a bad member", () => {
      expect(parseAdminCommand("vip not-an-email 30").kind).toBe("invalid");
      expect(parseAdminCommand("vip user@example.com soon").kind).toBe("invalid");
    });
  });

  describe("manual verification", () => {
    it("parses verify and unverify", () => {
      expect(parseAdminCommand("verify user@example.com")).toEqual({ kind: "verify", email: "user@example.com" });
      expect(parseAdminCommand("verify off user@example.com")).toEqual({ kind: "unverify", email: "user@example.com" });
      expect(parseAdminCommand("unverify user@example.com")).toEqual({ kind: "unverify", email: "user@example.com" });
    });
  });

  describe("IP bans", () => {
    it("parses ban with optional reason", () => {
      expect(parseAdminCommand("ban 192.168.1.5")).toEqual({ kind: "ban", ip: "192.168.1.5", reason: null });
      expect(parseAdminCommand("ban 1.2.3.4 spam bot")).toEqual({ kind: "ban", ip: "1.2.3.4", reason: "spam bot" });
      expect(parseAdminCommand("ban 2001:db8::1")).toEqual({ kind: "ban", ip: "2001:db8::1", reason: null });
    });

    it("parses unban", () => {
      expect(parseAdminCommand("unban 192.168.1.5")).toEqual({ kind: "unban", ip: "192.168.1.5" });
    });

    it("rejects a non-IP", () => {
      expect(parseAdminCommand("ban banana").kind).toBe("invalid");
    });
  });

  describe("announce", () => {
    it("uses a default title for plain text", () => {
      const c = parseAdminCommand("elon Sayt yangilandi");
      expect(c).toEqual({ kind: "announce", title: "Telegram e'lon", message: "Sayt yangilandi" });
    });

    it("splits title and message on  |  separator", () => {
      const c = parseAdminCommand("elon Yangi bo'lim | Motivatsiya bo'limi ochildi");
      expect(c).toEqual({ kind: "announce", title: "Yangi bo'lim", message: "Motivatsiya bo'limi ochildi" });
    });

    it("complains when the text is empty", () => {
      expect(parseAdminCommand("elon").kind).toBe("invalid");
    });
  });

  describe("unknown", () => {
    it("returns unknown for unrecognized input", () => {
      expect(parseAdminCommand("salom nima gap")).toEqual({ kind: "unknown" });
      expect(parseAdminCommand("")).toEqual({ kind: "unknown" });
    });
  });
});

describe("executeUserApprovalCommand (dedicated approval bot)", () => {
  it("returns null for system commands so the bot warns them away", async () => {
    expect(await executeUserApprovalCommand("stats")).toBeNull();
    expect(await executeUserApprovalCommand("pending")).toBeNull();
    expect(await executeUserApprovalCommand("elon Yangi imkoniyat | Raqamli poster")).toBeNull();
    expect(await executeUserApprovalCommand("salom nima gap")).toBeNull();
  });

  it("returns null for quote approval — that stays on the main bot", async () => {
    expect(await executeUserApprovalCommand("approve 550e8400-e29b-41d4-a716-446655440000")).toBeNull();
    expect(await executeUserApprovalCommand("rad et abc spam")).toBeNull();
  });

  it("surfaces the parsing hint for malformed approval attempts", async () => {
    const hint = await executeUserApprovalCommand("verify");
    expect(hint).toContain("✗");
    expect(hint).toContain("Email kiriting");
  });
});