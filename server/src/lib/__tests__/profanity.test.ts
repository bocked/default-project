import { describe, expect, it } from "vitest";
import { censorText, hasBannedWord } from "../profanity.js";

describe("profanity filter", () => {
  it("leaves clean text untouched", () => {
    expect(censorText("Hello world")).toBe("Hello world");
    expect(hasBannedWord("Hello world")).toBe(false);
  });

  it("flags banned words", () => {
    expect(hasBannedWord("this is a fuck word")).toBe(true);
  });

  it("censors banned words", () => {
    const censored = censorText("fuck");
    expect(censored).toContain("*");
    expect(hasBannedWord(censored)).toBe(false);
  });

  it("matches regardless of casing", () => {
    expect(hasBannedWord("FUCK")).toBe(true);
  });
});
