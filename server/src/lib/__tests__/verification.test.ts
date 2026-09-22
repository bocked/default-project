import { describe, expect, it } from "vitest";
import { profileCanPost } from "../../middleware/auth.js";

const plain = {
  role: "USER",
  emailVerified: false,
  phoneVerified: false,
  isSuperApproved: false,
  isPremium: false,
  premiumExpiresAt: null,
};

describe("profileCanPost", () => {
  it("rejects an unverified regular user", () => {
    expect(profileCanPost(plain)).toBe(false);
  });

  it("accepts email-verified users", () => {
    expect(profileCanPost({ ...plain, emailVerified: true })).toBe(true);
  });

  it("accepts phone-verified users", () => {
    expect(profileCanPost({ ...plain, phoneVerified: true })).toBe(true);
  });

  it("accepts users manually approved by a SUPER_ADMIN (no email/phone needed)", () => {
    expect(profileCanPost({ ...plain, isSuperApproved: true })).toBe(true);
  });

  it("accepts active VIP users without verification", () => {
    expect(profileCanPost({ ...plain, isPremium: true, premiumExpiresAt: null })).toBe(true);
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(profileCanPost({ ...plain, isPremium: true, premiumExpiresAt: future })).toBe(true);
  });

  it("does not count an expired VIP as verified", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    expect(profileCanPost({ ...plain, isPremium: true, premiumExpiresAt: past })).toBe(false);
  });

  it("always trusts ADMIN and SUPER_ADMIN roles", () => {
    expect(profileCanPost({ ...plain, role: "ADMIN" })).toBe(true);
    expect(profileCanPost({ ...plain, role: "SUPER_ADMIN" })).toBe(true);
  });
});