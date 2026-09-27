"use client";

import { BANNER_CONFIG, type BannerDefinition, type BannerSide } from "@/config/banners";
import { useI18n } from "@/lib/i18n";

interface StickyBannerProps {
  side: BannerSide;
  /** Runtime overrides loaded from /api/content (admin Content Manager). */
  overrides?: Partial<BannerDefinition>;
  /** Master switch from `banner.enabled`. */
  enabled?: boolean;
}

/**
 * Sticky sidebar banner column. Visible only on `xl` (1280px+) screens; the
 * column sticks 80px below the top of the viewport as the page scrolls.
 */
export function StickyBanner({ side, overrides, enabled = true }: StickyBannerProps) {
  const { t } = useI18n();
  const base = BANNER_CONFIG[side];

  if (!base.enabled || !enabled) return null;

  const banner: BannerDefinition = { ...base, ...(overrides ?? {}) };

  let content: React.ReactNode;
  if (banner.html) {
    content = <div className="w-[240px]" dangerouslySetInnerHTML={{ __html: banner.html }} />;
  } else if (banner.image) {
    const img = (
      // eslint-disable-next-line @next/next/no-img-element -- banners accept any external CDN URL
      <img
        src={banner.image}
        alt={banner.alt ?? ""}
        className={`w-[240px] h-auto rounded-2xl border border-slate-200 object-cover shadow-sm dark:border-slate-800`}
      />
    );
    content = banner.href ? (
      <a href={banner.href} target="_blank" rel="noopener noreferrer" className="block">
        {img}
      </a>
    ) : (
      img
    );
  } else {
    const inner = (
      <div
        className={`flex w-[240px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-16 text-center dark:border-slate-700 dark:bg-slate-900`}
      >
        <span className="font-serif text-xl font-semibold text-slate-700 dark:text-slate-200">{t("hero.title")}</span>
        <span className="text-xs uppercase tracking-widest text-slate-400 dark:text-slate-500">
          {t("banner.placeholder")}
        </span>
      </div>
    );
    content = banner.href ? (
      <a href={banner.href} className="block">
        {inner}
      </a>
    ) : (
      inner
    );
  }

  return (
    <aside className="hidden xl:block">
      <div className="sticky top-[80px]">{content}</div>
    </aside>
  );
}