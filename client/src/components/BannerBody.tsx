"use client";

import type { BannerDefinition } from "@/config/banners";
import { useI18n } from "@/lib/i18n";
import { safeBannerUrl } from "@/lib/bannerUrl";

export type BannerVariant = "side" | "top" | "feed" | "bottom";

interface BannerBodyProps {
  def: BannerDefinition;
  variant: BannerVariant;
}

const IMG_CLASS: Record<BannerVariant, string> = {
  side: "h-auto w-[240px] rounded-2xl border border-slate-200 object-cover shadow-sm dark:border-slate-800",
  top: "h-12 w-auto max-w-[300px] object-contain",
  feed: "aspect-[21/9] w-full object-cover",
  bottom: "h-12 w-auto max-w-[300px] object-contain",
};

const PLACEHOLDER_CLASS: Record<BannerVariant, string> = {
  side: "flex w-[240px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-16 text-center dark:border-slate-700 dark:bg-slate-900",
  top: "flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 dark:border-slate-700 dark:bg-slate-900",
  feed: "flex aspect-[21/9] w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center dark:border-slate-700 dark:bg-slate-900",
  bottom: "flex h-14 w-full items-center justify-center gap-2 px-4",
};

/**
 * Renders the actual banner content for a slot: raw HTML or a linked image
 * (decided by the persisted `def.type`; when absent, a non-empty `html` wins
 * over `image`), otherwise a neutral branded placeholder. Variants adapt
 * size/shape to the banner position (sticky column, mobile header row, in-feed
 * card, bottom bar).
 */
export function BannerBody({ def, variant }: BannerBodyProps) {
  const { t } = useI18n();

  const mode: "image" | "code" = def.type ?? (def.html ? "code" : "image");
  // `href` and `image` are admin-controlled and land in a real `href`/`src`, so
  // they are re-checked against the scheme allowlist before use. The server
  // applies the same policy on the write and read paths; this keeps a stale or
  // tampered value (e.g. `javascript:`) from ever reaching the DOM.
  const href = safeBannerUrl(def.href);
  const image = safeBannerUrl(def.image);

  if (mode === "code" && def.html) {
    // Sanitised server-side before it is stored and again before it is served,
    // so no script-bearing element can reach the DOM here.
    return <div className="w-full" dangerouslySetInnerHTML={{ __html: def.html }} />;
  }

  if (mode === "image" && image) {
    const img = (
      // eslint-disable-next-line @next/next/no-img-element -- banners accept any external CDN URL
      <img
        src={image}
        alt={def.alt ?? ""}
        className={IMG_CLASS[variant]}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block w-full">
        {img}
      </a>
    ) : (
      img
    );
  }

  const placeholder = (
    <div className={PLACEHOLDER_CLASS[variant]}>
      <span className="font-serif text-lg font-semibold text-slate-700 dark:text-slate-200">{t("hero.title")}</span>
      <span className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
        {t("banner.placeholder")}
      </span>
    </div>
  );

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="block w-full">
      {placeholder}
    </a>
  ) : (
    placeholder
  );
}