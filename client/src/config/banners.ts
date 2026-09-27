export type BannerSide = "left" | "right";

/**
 * A single sticky sidebar banner. `html` wins over `image` when both are set:
 * it is rendered as-is (e.g. an AdSense snippet or custom markup), while
 * `image` + `href` produce a plain linked image banner. When neither is set a
 * neutral branded placeholder is shown so the column never looks broken.
 */
export interface BannerDefinition {
  /** Master per-side switch. */
  enabled: boolean;
  /** Raw HTML (ad code / custom markup). Admin-controlled, trusted input. */
  html?: string;
  image?: string;
  href?: string;
  alt?: string;
}

/**
 * Default banners. Edit these in code, or override at runtime from the admin
 * panel via Content Manager keys: `banner.enabled`, `banner.left.html`,
 * `banner.left.image`, `banner.left.href`, `banner.left.alt` and the same for
 * `banner.right.*`. Runtime values win over this config.
 */
export const BANNER_CONFIG: Record<BannerSide, BannerDefinition> = {
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
};

export interface BannerOverrides {
  /** Master toggle read from `banner.enabled` ("0" hides every banner). */
  enabled?: boolean;
  left?: Partial<BannerDefinition>;
  right?: Partial<BannerDefinition>;
}

const STRING_FIELDS = ["html", "image", "href", "alt"] as const;
const SIDE_FIELDS: Array<{ key: (typeof STRING_FIELDS)[number]; suffix: string }> = STRING_FIELDS.map((key) => ({
  key,
  suffix: key,
}));

/**
 * Maps the public /api/content record (admin-editable text blocks) onto banner
 * overrides. Empty strings fall back to the static BANNER_CONFIG values.
 */
export function parseBannerOverrides(content: Record<string, string>): BannerOverrides {
  const overrides: BannerOverrides = {};
  const master = content["banner.enabled"];
  if (master !== undefined) overrides.enabled = master !== "0";

  for (const side of ["left", "right"] as const) {
    const part: Partial<BannerDefinition> = {};
    for (const field of SIDE_FIELDS) {
      const raw = content[`banner.${side}.${field.suffix}`];
      if (typeof raw === "string" && raw.trim() !== "") part[field.key] = raw;
    }
    if (Object.keys(part).length > 0) overrides[side] = part;
  }

  return overrides;
}