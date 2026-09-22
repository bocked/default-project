import { describe, expect, it } from "vitest";
import { isPremiumActive } from "../premium.js";

describe("isPremiumActive", () => {
  it("is false for non-premium users", () => {
    expect(isPremiumActive({ isPremium: false, premiumExpiresAt: null })).toBe(false);
  });

  it("is true for premium with no expiry (lifetime)", () => {
    expect(isPremiumActive({ isPremium: true, premiumExpiresAt: null })).toBe(true);
  });

  it("is true when the expiry is still in the future", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(isPremiumActive({ isPremium: true, premiumExpiresAt: future })).toBe(true);
  });

  it("is false once the expiry has passed", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    expect(isPremiumActive({ isPremium: true, premiumExpiresAt: past })).toBe(false);
  });

  it("accepts ISO date strings", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(isPremiumActive({ isPremium: true, premiumExpiresAt: future })).toBe(true);
  });

  it("is false for a revoked flag even with a future date", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(isPremiumActive({ isPremium: false, premiumExpiresAt: future })).toBe(false);
  });
});