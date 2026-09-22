import type { User } from "@/lib/types";

/** Mirrors the server rule: active premium = flag on AND (no expiry OR expiry
 *  is in the future). `isPremium` alone may stay true after expiry. */
export function isPremiumActive(user: Pick<User, "isPremium" | "premiumExpiresAt"> | null | undefined): boolean {
  if (!user?.isPremium) return false;
  if (!user.premiumExpiresAt) return true;
  return new Date(user.premiumExpiresAt).getTime() > Date.now();
}

/** User-friendly expiry label for the profile: e.g. "01.10.2026" or "Umrbod". */
export function formatPremiumExpiry(user: Pick<User, "premiumExpiresAt"> | null | undefined, vip = "\u2605"): string {
  if (!user?.premiumExpiresAt) return `Umrbod ${vip}`;
  return `${new Date(user.premiumExpiresAt).toLocaleDateString("uz-UZ")}gacha ${vip}`;
}