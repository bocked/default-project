import type { Metadata } from "next";

/**
 * Single source of truth for SEO/OG metadata.
 *
 * WHY THIS FILE EXISTS: 21 of the 25 pages in this app are Client Components
 * ("use client"), and a Client Component cannot export `metadata`. Their SEO
 * therefore has to live in a nested `layout.tsx` (a Server Component) per
 * route. Centralising the shape here means every one of those layouts emits the
 * same OpenGraph/Twitter/canonical set instead of drifting field by field.
 *
 * NOTE ON OG IMAGES: this project builds with `output: "export"` (Cloudflare
 * Pages). Relative image paths would need `metadataBase`, and `ImageResponse`
 * route handlers are not available under static export, so the card image is a
 * committed static asset referenced by absolute path. 1200x630 is the size
 * Facebook/LinkedIn/Twitter all expect.
 */

/**
 * Canonical origin. Used for metadataBase, canonical links, og:url and the
 * sitemap. Overridable at build time so a preview/staging deploy does not emit
 * production URLs in its share cards.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.yerlikoglon.uz"
).replace(/\/$/, "");

export const SITE_NAME = "Iqtibosim";

export const DEFAULT_OG_IMAGE = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Iqtibosim — iqtiboslar to'plami",
};

export interface PageMetaInput {
  /** Route path, e.g. "/login" or "/". Used for the canonical URL. */
  path: string;
  title: string;
  description: string;
  /**
   * Set false for pages that should never be indexed (auth screens, personal
   * areas, the whole admin panel). Defaults to true.
   */
  index?: boolean;
  /** Overrides the default card image for a page with its own artwork. */
  image?: { url: string; width?: number; height?: number; alt?: string };
  /** Keywords for the crawlers that still use them. */
  keywords?: string[];
  /** Locale for og:locale. The UI is Uzbek Latin. */
  locale?: string;
}

/**
 * Builds a complete, consistent Metadata object for one route.
 *
 * Call it from a Server Component only (a `layout.tsx` or a non-client
 * `page.tsx`) — it returns the `metadata` export.
 */
export function pageMeta({
  path,
  title,
  description,
  index = true,
  image,
  keywords,
  locale = "uz_UZ",
}: PageMetaInput): Metadata {
  const url = path === "/" ? SITE_URL : `${SITE_URL}${path}`;
  const img = image ?? DEFAULT_OG_IMAGE;

  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    robots: index
      ? { index: true, follow: true, googleBot: { index: true, follow: true } }
      : { index: false, follow: false, googleBot: { index: false, follow: false } },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale,
      url,
      title,
      description,
      images: [
        {
          url: img.url.startsWith("http") ? img.url : `${SITE_URL}${img.url}`,
          width: img.width ?? DEFAULT_OG_IMAGE.width,
          height: img.height ?? DEFAULT_OG_IMAGE.height,
          alt: img.alt ?? DEFAULT_OG_IMAGE.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [img.url.startsWith("http") ? img.url : `${SITE_URL}${img.url}`],
    },
    // Next derives `robots`/`googlebot` meta from the flag above, but has no
    // first-class field for og:noindex — and that is what actually suppresses
    // the rich link preview when someone pastes an /admin or /login URL into
    // Slack or Messenger. It has to be passed through `other`.
    // Next always renders `other` keys with `name=`, while the OG spec (and the
    // Facebook/Slack unfurlers that consume it) keys off `property=`. So
    // `scripts/generate-csp.mjs` rewrites `name="og:noindex"` to
    // `property="og:noindex"` in the emitted HTML after the build. The robots
    // meta above remains the authoritative noindex signal for search engines;
    // this one only affects link previews.
    ...(index ? {} : { other: { "og:noindex": "true" } }),
  };
}

/** Convenience for auth/private areas: identical to pageMeta but noindex. */
export function privateMeta(input: Omit<PageMetaInput, "index">): Metadata {
  return pageMeta({ ...input, index: false });
}