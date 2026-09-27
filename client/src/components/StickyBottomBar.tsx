"use client";

import { bannerContentKey, bannerHasContent, resolveBanner } from "@/config/banners";
import { BannerBody } from "./BannerBody";
import { BannerWrapper } from "./BannerWrapper";

interface StickyBottomBarProps {
  overrides?: Parameters<typeof resolveBanner>[1];
  enabled?: boolean;
}

/** Mobile-only banner pinned to the bottom of the viewport (< 1280px). */
export function StickyBottomBar({ overrides, enabled = true }: StickyBottomBarProps) {
  const def = resolveBanner("bottom", overrides, enabled);
  if (!def) return null;

  return (
    <BannerWrapper
      id="banner.bottom"
      contentKey={bannerContentKey(def)}
      slot="bottom"
      trackable={bannerHasContent(def)}
      className="fixed inset-x-0 bottom-0 z-40 xl:hidden"
      closeClassName="right-3 top-1/2 -translate-y-1/2"
      leaveClassName="opacity-0 translate-y-6"
    >
      <div className="w-full border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-center px-10 py-2">
          <BannerBody def={def} variant="bottom" />
        </div>
      </div>
    </BannerWrapper>
  );
}