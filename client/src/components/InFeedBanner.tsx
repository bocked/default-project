"use client";

import { bannerContentKey, bannerHasContent, type BannerDefinition } from "@/config/banners";
import { BannerBody } from "./BannerBody";
import { BannerWrapper } from "./BannerWrapper";

interface InFeedBannerProps {
  /** Effective feed banner definition (already resolved by the caller). */
  def: BannerDefinition;
}

/** Mobile-only advertising card inserted into the quotes feed (< 1280px). */
export function InFeedBanner({ def }: InFeedBannerProps) {
  if (!def.enabled) return null;

  return (
    <BannerWrapper
      id="banner.feed"
      contentKey={bannerContentKey(def)}
      slot="feed"
      trackable={bannerHasContent(def)}
      className="w-full xl:hidden"
      leaveClassName="opacity-0 scale-[0.99]"
    >
      <BannerBody def={def} variant="feed" />
    </BannerWrapper>
  );
}