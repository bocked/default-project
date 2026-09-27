import { describe, it, expect, vi, afterEach } from "vitest";
import { checkBotToken, sanitizeSettings, type TelegramRuntimeSettings } from "../telegramSettings.js";

function mockGetMe(json: unknown, status = 200, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const body = JSON.stringify(json);
      const res = new Response(body, { status });
      Object.defineProperty(res, "ok", { value: ok });
      return res;
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeSettings(overrides: Partial<TelegramRuntimeSettings> = {}): TelegramRuntimeSettings {
  return {
    id: "main",
    botToken: "",
    superAdminChatId: "",
    channelValue: "",
    channelChatId: "",
    notifyPolicy: true,
    notifyNewFeature: true,
    notifyHealth: true,
    notifyBackup: true,
    botStatus: "disabled",
    botUsername: null,
    botId: null,
    lastError: null,
    lastCheckedAt: null,
    approvalBotToken: "",
    approvalBotUsername: null,
    approvalBotId: null,
    approvalBotStatus: "disabled",
    approvalBotLastError: null,
    approvalBotLastCheckedAt: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("checkBotToken (getMe)", () => {
  it("returns ok with both username and numeric id from getMe", async () => {
    mockGetMe({ ok: true, result: { id: 123456789, username: "yerlikoglon_bot" } });
    const result = await checkBotToken("123456:abc");
    expect(result).toEqual({ ok: true, username: "yerlikoglon_bot", id: 123456789 });
  });

  it("rejects an empty token without a network call", async () => {
    const result = await checkBotToken("   ");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("kiritilmagan");
  });

  it("reports 401 as an invalid token", async () => {
    mockGetMe({ ok: false, description: "Unauthorized" }, 401, false);
    const result = await checkBotToken("bad:token");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("401");
  });

  it("reports a response without a username as an error", async () => {
    mockGetMe({ ok: true, result: { id: 1 } });
    const result = await checkBotToken("123456:abc");
    expect(result.ok).toBe(false);
  });
});

describe("sanitizeSettings (token masking)", () => {
  it("masks both tokens with maskToken and never exposes the full value", () => {
    const sanitized = sanitizeSettings(
      fakeSettings({
        botToken: "65239401234567Xs5M",
        botUsername: "main_bot",
        botId: "111",
        approvalBotToken: "98765432198765432aBcD",
        approvalBotUsername: "abitiruv_bot",
        approvalBotId: "222",
      })
    );
    expect(sanitized.botTokenMasked).toBe("652394…Xs5M");
    expect(sanitized.approvalBotTokenMasked).toBe("987654…aBcD");
    expect(sanitized.botTokenMasked).not.toContain("01234567");
    expect(sanitized.approvalBotTokenMasked).not.toContain("219876");
    expect(sanitized.botId).toBe("111");
    expect(sanitized.approvalBotId).toBe("222");
  });

  it("shortens a very short token into a safe hint", () => {
    const sanitized = sanitizeSettings(fakeSettings({ botToken: "12345", approvalBotToken: "abcdefghijklmno" }));
    expect(sanitized.botTokenMasked).toBe("12***");
    expect(sanitized.approvalBotTokenMasked).toBe("abcdef…lmno");
  });

  it("returns empty masks when no token is set", () => {
    const sanitized = sanitizeSettings(fakeSettings());
    expect(sanitized.botTokenSet).toBe(false);
    expect(sanitized.botTokenMasked).toBe("");
    expect(sanitized.approvalBotTokenMasked).toBe("");
  });
});