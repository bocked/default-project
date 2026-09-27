export type BannerSide = "left" | "right";
export type BannerSlot = BannerSide | "top" | "feed" | "bottom";

/**
 * A single banner slot. `html` wins over `image` when both are set: it is
 * rendered as-is (e.g. an AdSense snippet or custom markup), while `image` +
 * `href` produce a plain linked image banner. When neither is set a neutral
 * branded placeholder is shown so the column never looks broken.
 */
export interface BannerDefinition {
  /** Master per-slot switch. */
  enabled: boolean;
  /** Raw HTML (ad code / custom markup). Admin-controlled, trusted input. */
  html?: string;
  image?: string;
  href?: string;
  alt?: string;
}

export interface BannerConfig {
  /** Per-slot defaults, indexed by slot name. */
  slots: Record<BannerSlot, BannerDefinition>;
  /** Insert an in-feed banner after every N quotes (mobile feed). */
  feedEvery: number;
}

/**
 * Default banners. Edit these in code, or override at runtime from the admin
 * panel via Content Manager keys: `banner.enabled`, `banner.left.html`,
 * `banner.left.image`, `banner.left.href`, `banner.left.alt` and the same for
 * `banner.right.*`, `banner.top.*`, `banner.feed.*`, `banner.bottom.*`, plus
 * `banner.feed.every`. Runtime values win over this config.
 */
export const BANNER_CONFIG: BannerConfig = {
  slots: {
    left: {
      enabled: true,
      href: "/about",
      alt: "Iqtibosim — sayt haqida",
    },
    right: {
      enabled: true,
      href: "/tests",
      alt: "Iqtibosim — testlar",
    },
    top: {
      enabled: true,
      href: "/about",
      alt: "Iqtibosim — sayt haqida",
    },
    feed: {
      enabled: true,
      href: "/tests",
      alt: "Iqtibosim — testlar",
    },
    bottom: {
      enabled: true,
      href: "/register",
      alt: "Iqtibosim — ro'yxatdan o'tish",
    },
  },
  feedEvery: 4,
};

export interface BannerOverrides {
  /** Master toggle read from `banner.enabled` ("0" hides every banner). */
  enabled?: boolean;
  left?: Partial<BannerDefinition>;
  right?: Partial<BannerDefinition>;
  top?: Partial<BannerDefinition>;
  feed?: Partial<BannerDefinition>;
  bottom?: Partial<BannerDefinition>;
  feedEvery?: number;
}

const SLOT_NAMES: BannerSlot[] = ["left", "right", "top", "feed", "bottom"];
const STRING_FIELDS = ["html", "image", "href", "alt"] as const;

/**
 * Maps the public /api/content record (admin-editable text blocks) onto banner
 * overrides. Empty strings fall back to the static BANNER_CONFIG values.
 */
export function parseBannerOverrides(content: Record<string, string>): BannerOverrides {
  const overrides: BannerOverrides = {};
  const master = content["banner.enabled"];
  if (master !== undefined) overrides.enabled = master !== "0";

  for (const slot of SLOT_NAMES) {
    const part: Partial<BannerDefinition> = {};
    const enabledRaw = content[`banner.${slot}.enabled`];
    if (typeof enabledRaw === "string") part.enabled = enabledRaw !== "0";
    for (const field of STRING_FIELDS) {
      const raw = content[`banner.${slot}.${field}`];
      if (typeof raw === "string" && raw.trim() !== "") part[field] = raw;
    }
    if (Object.keys(part).length > 0) overrides[slot] = part;
  }

  const everyRaw = Number(content["banner.feed.every"]);
  if (Number.isInteger(everyRaw) && everyRaw > 0) overrides.feedEvery = everyRaw;

  return overrides;
}

/**
 * Resolves a slot's effective banner definition (config merged with runtime
 * overrides). Returns null when the banner is disabled by config, by the
 * per-slot `banner.<slot>.enabled` switch, or by the master `banner.enabled`.
 */
export function resolveBanner(
  slot: BannerSlot,
  overrides?: Partial<BannerDefinition>,
  masterEnabled = true,
): BannerDefinition | null {
  const base = BANNER_CONFIG.slots[slot];
  if (!base.enabled || !masterEnabled) return null;
  const def = { ...base, ...(overrides ?? {}) };
  if (!def.enabled) return null;
  return def;
}