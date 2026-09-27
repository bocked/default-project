"use client";

import { resolveBanner } from "@/config/banners";
import { BannerBody } from "./BannerBody";
import { BannerWrapper } from "./BannerWrapper";

interface MobileTopBannerProps {
  overrides?: Parameters<typeof resolveBanner>[1];
  enabled?: boolean;
}

/** Horizontal mobile banner shown right below the header (< 1280px). */
export function MobileTopBanner({ overrides, enabled = true }: MobileTopBannerProps) {
  const def = resolveBanner("top", overrides, enabled);
  if (!def) return null;

  return (
    <BannerWrapper
      id="banner.top"
      className="w-full border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 xl:hidden"
      leaveClassName="opacity-0 -translate-y-2"
    >
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center px-4 py-2.5">
        <BannerBody def={def} variant="top" />
      </div>
    </BannerWrapper>
  );
}