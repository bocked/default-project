"use client";

import { bannerContentKey, resolveBanner, type BannerSide } from "@/config/banners";
import { BannerBody } from "./BannerBody";
import { BannerWrapper } from "./BannerWrapper";

interface StickyBannerProps {
  side: BannerSide;
  /** Runtime overrides loaded from /api/content (admin Content Manager). */
  overrides?: Parameters<typeof resolveBanner>[1];
  /** Master switch from `banner.enabled`. */
  enabled?: boolean;
}

/**
 * Desktop sticky sidebar banner. The `<aside>` is the grid item, so `sticky`
 * keeps it pinned 80px below the top while the page scrolls; hidden below the
 * `xl` breakpoint where the mobile banners take over.
 */
export function StickyBanner({ side, overrides, enabled = true }: StickyBannerProps) {
  const def = resolveBanner(side, overrides, enabled);
  if (!def) return null;

  return (
    <aside className="sticky top-[80px] hidden max-h-[calc(100vh-96px)] overflow-y-auto xl:block">
      <BannerWrapper
        id={`banner.${side}`}
        contentKey={bannerContentKey(def)}
        leaveClassName="opacity-0 scale-[0.98]"
      >
        <BannerBody def={def} variant="side" />
      </BannerWrapper>
    </aside>
  );
}