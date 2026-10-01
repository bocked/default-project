import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteMeta";

// Under `output: "export"` Next treats robots.txt as a Route Handler and refuses
// to build it unless the route is explicitly static. Without this the export
// fails with "dynamic = force-static not configured on route /robots.txt".
export const dynamic = "force-static";

/**
 * robots.txt for the exported site (emitted to out/robots.txt at build time).
 *
 * `disallow: /` still allows crawlers to *fetch* excluded URLs — the `noindex`
 * robots meta tag in each page's metadata (see app/admin/layout.tsx and the
 * privateMeta() calls) is what actually keeps them out of the index. Both are
 * set deliberately: disallow here saves crawl budget, noindex there does the
 * real work. Disallowing alone would be a mistake — a blocked URL cannot be
 * crawled, so its noindex tag would never be read.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin", // whole admin panel
          "/api/", // API host in production, but harmless to state here
          "/profile",
          "/user",
          "/login",
          "/register",
          "/logout",
          "/forgot-password",
          "/reset-password",
          "/verify-email",
          "/tests/create",
          // Build output + tooling that should never be indexed.
          "/_next/",
          "/sw.js",
          "/manifest.webmanifest",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}