import type { Metadata } from "next";
import HomeFeed from "./HomeFeed";
import { pageMeta } from "@/lib/siteMeta";

/**
 * The home page is the site's primary search/social target, so it carries a
 * full OpenGraph + Twitter card of its own.
 *
 * Why the split: the feed itself (pagination, search params, filters, the
 * mini-game) is all interactive and must stay a Client Component, but a Client
 * Component cannot export `metadata`. So `HomeFeed.tsx` holds `"use client"` and
 * the markup, while this thin Server Component owns the SEO export. The root
 * layout's defaults already cover the general case, but the home page deserves
 * its own description and keywords.
 *
 * Under `output: "export"` this metadata is baked into out/index.html at build
 * time, which is exactly what a crawler or a WhatsApp/Telegram link preview
 * needs — they never execute JS before deciding how to render the card.
 */
export const metadata: Metadata = pageMeta({
  path: "/",
  title: "Iqtibosim — iqtiboslar to'plami",
  description:
    "Fikrlarni to'playdigan, bo'limlar va heshteglar bo'yicha saralanadigan iqtiboslar sayti. Kunlik iqtibos, testlar va to'plamlar.",
  keywords: ["iqtibos", "kundalik iqtibos", "motivatsiya", "o'zbekcha iqtiboslar", "aqliyat"],
});

export default function Page() {
  return <HomeFeed />;
}