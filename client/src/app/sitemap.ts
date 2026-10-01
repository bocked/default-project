import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteMeta";

// Required under `output: "export"` — see the note in ./robots.ts.
export const dynamic = "force-static";

/**
 * Static sitemap for the exported site.
 *
 * `sitemap.ts` is evaluated at build time and written to out/sitemap.xml, which
 * Cloudflare Pages serves directly — no runtime work, no server needed.
 *
 * SCOPE RULES, deliberate:
 *  - Only genuinely public, indexable routes are listed. Auth screens and
 *    personal pages (/profile, /user, /tests/create, the whole /admin tree) are
 *    excluded: they are noindex in their metadata, and listing them here would
 *    contradict that.
 *  - No `lastModified` per page. Under a static export the HTML is regenerated
 *    wholesale on every deploy, so a build-time date would churn every URL on
 *    each deploy and train crawlers to ignore the field. `changeFrequency` and
 *    `priority` are the honest signals here.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/tests`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/cookies`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}