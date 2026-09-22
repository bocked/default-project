/**
 * Premium (VIP) eligibility. `isPremium` alone is not enough: the flag may
 * stay true after `premiumExpiresAt` passes (admins can extend/shorten a
 * subscription), so "active" always means: flag set AND (no expiry OR the
 * expiry is still in the future).
 */
export interface PremiumCheckable {
  isPremium: boolean;
  premiumExpiresAt?: Date | string | null;
}

export function isPremiumActive(user: PremiumCheckable): boolean {
  if (!user.isPremium) return false;
  if (!user.premiumExpiresAt) return true;
  return new Date(user.premiumExpiresAt).getTime() > Date.now();
}

/** ISO string of the active premium expiry, or null for a lifetime plan. */
export function premiumExpiryISO(user: PremiumCheckable): string | null {
  if (!user.premiumExpiresAt) return null;
  return new Date(user.premiumExpiresAt).toISOString();
}