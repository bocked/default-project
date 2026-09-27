"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { BANNER_CONFIG, parseBannerOverrides, type BannerOverrides } from "@/config/banners";
import { AnnouncementsBanner } from "./AnnouncementsBanner";
import { BackButton } from "./BackButton";
import { MobileTopBanner } from "./MobileTopBanner";
import { NavBar } from "./NavBar";
import { StickyBanner } from "./StickyBanner";
import { StickyBottomBar } from "./StickyBottomBar";
import { WwwUzTracker } from "./WwwUzTracker";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Admin console gets a wider content area so tables and sidebars fit.
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  const [footer, setFooter] = useState("Iqtibosim — fikrlarni to'playdigan joy");
  // `usePathname` is null during static prerender, so only show the back
  // button after hydration to keep server and client markup identical.
  const [mounted, setMounted] = useState(false);
  const [bannerOverrides, setBannerOverrides] = useState<BannerOverrides>({});

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    void api<{ content: Record<string, string> }>("/api/content")
      .then((d) => {
        setBannerOverrides(parseBannerOverrides(d.content));
        if (typeof d.content["footer.about"] === "string") setFooter(d.content["footer.about"]);
      })
      .catch(() => {});
  }, []);

  const backButton = mounted && pathname !== "/" ? <BackButton /> : null;

  return (
    <div className="flex min-h-screen flex-col">
      <WwwUzTracker />
      <AnnouncementsBanner />
      <NavBar />
      {!isAdmin && <MobileTopBanner overrides={bannerOverrides.top} enabled={bannerOverrides.enabled} />}
      <main className={`mx-auto w-full flex-1 px-4 py-4 sm:px-6 sm:py-6 ${isAdmin ? "max-w-7xl" : "max-w-3xl xl:max-w-[1440px]"}`}>
        {isAdmin ? (
          <>
            {backButton}
            {children}
          </>
        ) : (
          <div className="grid grid-cols-1 items-start xl:grid-cols-[240px_minmax(0,768px)_240px] xl:justify-center xl:gap-8">
            <StickyBanner side="left" overrides={bannerOverrides.left} enabled={bannerOverrides.enabled} />
            <div className="min-w-0">
              {backButton}
              {children}
            </div>
            <StickyBanner side="right" overrides={bannerOverrides.right} enabled={bannerOverrides.enabled} />
          </div>
        )}
      </main>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        {footer}
      </footer>
      {!isAdmin && BANNER_CONFIG.slots.bottom.enabled && (bannerOverrides.enabled ?? true) && (
        <>
          <StickyBottomBar overrides={bannerOverrides.bottom} enabled={bannerOverrides.enabled} />
          <div className="h-16 shrink-0 xl:hidden" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
