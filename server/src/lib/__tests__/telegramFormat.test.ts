import { describe, expect, it } from "vitest";
import { channelChatIdFor, formatLastChecked, maskToken, parseChannelValue } from "../telegramFormat.js";

describe("maskToken", () => {
  it("hides the middle of a long token", () => {
    const masked = maskToken("8998733338:AAFKHKaZh8OXlvHgx7TQ5ae6SPF5DId0AEw");
    expect(masked.startsWith("899873")).toBe(true);
    expect(masked.endsWith("AEw")).toBe(true);
    expect(masked).toContain("…");
    expect(masked).not.toContain("AFKHKaZh8OX");
  });

  it("returns an empty string for an empty token", () => {
    expect(maskToken("")).toBe("");
    expect(maskToken("  ")).toBe("");
  });
});

describe("parseChannelValue", () => {
  it("keeps numeric ids", () => {
    expect(parseChannelValue("-100123456789")).toBe("-100123456789");
    expect(parseChannelValue("123456789")).toBe("123456789");
  });

  it("keeps username handles", () => {
    expect(parseChannelValue("@my_channel")).toBe("@my_channel");
    expect(parseChannelValue("  @my_channel  ")).toBe("@my_channel");
  });

  it("resolves t.me/username links to @username", () => {
    expect(parseChannelValue("https://t.me/my_channel")).toBe("@my_channel");
    expect(parseChannelValue("t.me/my_channel")).toBe("@my_channel");
  });

  it("cannot resolve a private invite link", () => {
    expect(parseChannelValue("https://t.me/+kiAzRgAAG8dhMWZi")).toBeNull();
    expect(parseChannelValue("t.me/+AbC")).toBeNull();
  });

  it("returns null for junk", () => {
    expect(parseChannelValue("")).toBeNull();
    expect(parseChannelValue("not a link here")).toBeNull();
  });
});

describe("channelChatIdFor", () => {
  it("prefers the captured numeric channel id", () => {
    expect(channelChatIdFor({ channelChatId: "-100123", channelValue: "https://t.me/+zz" })).toBe("-100123");
  });

  it("falls back to the parsed channel value", () => {
    expect(channelChatIdFor({ channelChatId: "", channelValue: "@my_channel" })).toBe("@my_channel");
  });

  it("returns null when nothing is resolvable", () => {
    expect(channelChatIdFor({ channelChatId: "", channelValue: "https://t.me/+zz" })).toBeNull();
  });
});

describe("formatLastChecked", () => {
  it("renders a date or a dash", () => {
    expect(formatLastChecked(new Date("2026-09-25T10:00:00Z"))).toBe("2026-09-25 10:00:00");
    expect(formatLastChecked(null)).toBe("—");
  });
});