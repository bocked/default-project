"use client";

import { bannerContentKey, bannerHasContent, resolveBanner, type BannerSide } from "@/config/banners";
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
 * keeps it pinned 112px below the top (clearing the 56px navbar plus breathing
 * room) while the page scrolls; `z-10` keeps it visually below the `z-30`
 * navbar. Inside, a full-height flex column centers the banner vertically with
 * auto margins (overflow-safe), and the slide-in animation runs on load.
 * Hidden below the `xl` breakpoint where the mobile banners take over.
 */
export function StickyBanner({ side, overrides, enabled = true }: StickyBannerProps) {
  const def = resolveBanner(side, overrides, enabled);
  if (!def) return null;

  const slideClass = side === "left" ? "animate-slide-in-left" : "animate-slide-in-right";

  return (
    <aside className={`sticky top-28 z-10 hidden xl:flex ${slideClass}`}>
      <div className="flex h-[calc(100vh-14rem)] flex-col overflow-y-auto">
        <BannerWrapper
          id={`banner.${side}`}
          contentKey={bannerContentKey(def)}
          slot={side}
          trackable={bannerHasContent(def)}
          className="m-auto min-w-0"
          leaveClassName="opacity-0 scale-[0.98]"
        >
          <BannerBody def={def} variant="side" />
        </BannerWrapper>
      </div>
    </aside>
  );
}