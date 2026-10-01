import { describe, expect, it } from "vitest";
import { config } from "../../config.js";
import { corsOriginDecision, originAllowed } from "../corsRules.js";

describe("corsRules", () => {
  it("allow-lists the production + local origins", () => {
    for (const origin of [
      "https://yerlikoglon.uz",
      "https://www.yerlikoglon.uz",
      "http://localhost:3000",
    ]) {
      expect(config.corsOrigins).toContain(origin);
      expect(originAllowed(origin)).toBe(true);
      expect(corsOriginDecision(origin)).toBe(true);
    }
  });

  it("reflects every configured origin", () => {
    for (const origin of config.corsOrigins) {
      if (origin === "*") continue;
      const probe = origin.startsWith("https://*.") ? `https://sub.${origin.slice("https://*.".length)}` : origin;
      expect(originAllowed(probe)).toBe(true);
    }
  });

  it("never blocks a request that carries no Origin header", () => {
    expect(corsOriginDecision(undefined)).toBe(true);
    expect(corsOriginDecision("")).toBe(true);
    expect(corsOriginDecision("null")).toBe(true);
  });

  it("rejects an unknown origin without throwing", () => {
    expect(originAllowed("https://evil.example")).toBe(false);
    expect(corsOriginDecision("https://evil.example")).toBe(false);
  });
});