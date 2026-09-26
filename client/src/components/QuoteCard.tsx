"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useToast } from "./ToastProvider";
import { TtsButton } from "./TtsButton";
import type { Quote, QuoteCollection } from "@/lib/types";
import { renderQuoteImage, pickVipTheme } from "@/lib/quoteImage";
import { isPremiumActive } from "@/lib/premium";
import { quoteCardStyle, quoteTextStyle, quoteMarks } from "@/lib/quoteStyles";
import { StatusBadge } from "./StatusBadge";
import { TelegramPost } from "./TelegramPost";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" });
}

export function QuoteCard({
  quote,
  showStatus = false,
  highlight = false,
}: {
  quote: Quote;
  showStatus?: boolean;
  highlight?: boolean;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [liked, setLiked] = useState(Boolean(quote.likedByMe));
  const [likeCount, setLikeCount] = useState(quote.likeCount ?? 0);
  const [busy, setBusy] = useState(false);
  const [busyArt, setBusyArt] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // "To'plamga qo'shish" — bookmarks this quote into one of the user's
  // collections. The picker panel replaces the share menu while open.
  const [pickingCollection, setPickingCollection] = useState(false);
  const [collections, setCollections] = useState<QuoteCollection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsBusy, setCollectionsBusy] = useState(false);
  const [newCollectTitle, setNewCollectTitle] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocMouseDown(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /** "“<text>” — <author>" alone (the body of Telegram / WhatsApp shares). */
  function shareText(): string {
    return `\u201C${quote.text}\u201D \u2014 ${quote.displayAuthor}`;
  }

  /** Deep link that opens this exact quote highlighted on the homepage. */
  const shareUrl = `https://yerlikoglon.uz/?quote=${encodeURIComponent(quote.id)}`;

  /** Full share payload: quote + author + deep link. */
  function shareDetail(): string {
    return `${shareText()}\n\nBatafsil: ${shareUrl}`;
  }

  async function toggleLike(): Promise<void> {
    if (!user) {
      toast.info("Layk qo'yish uchun tizimga kiring");
      window.location.href = "/login";
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const next = !liked;
      await api<{ liked: boolean }>(`/api/quotes/${quote.id}/like`, {
        method: next ? "POST" : "DELETE",
      });
      setLiked(next);
      setLikeCount((c) => (next ? c + 1 : Math.max(0, c - 1)));
      toast.success(next ? "Layk qo'shildi" : "Layk olib tashlandi");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Layk amalga oshmadi");
    } finally {
      setBusy(false);
    }
  }

  async function shareAsImage(): Promise<void> {
    if (busyArt) return;
    setBusyArt(true);
    try {
      // VIP users get exclusive canvas backgrounds + fonts and their own
      // watermark (channel/handle) instead of the default site wordmark.
      const vip = isPremiumActive(user);
      const blob = await renderQuoteImage(quote, {
        theme: vip ? pickVipTheme(quote.id) : undefined,
        watermark: vip && user?.customWatermark?.trim() ? user.customWatermark.trim() : undefined,
      });
      const file = new File([blob], `iqtibos-${quote.id}.png`, { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Iqtibos" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `iqtibos-${quote.id}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("Rasm yuklab olindi");
      }
    } catch {
      // user cancelled the native share sheet or rendering failed: ignore
    } finally {
      setBusyArt(false);
      setMenuOpen(false);
    }
  }

  function shareOn(target: "telegram" | "whatsapp"): void {
    const text = shareDetail();
    const url =
      target === "telegram"
        ? `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setMenuOpen(false);
  }

  /** "Matn sifatida ulashish" — native share sheet when available, otherwise copy the text. */
  async function shareTextClipboard(): Promise<void> {
    const text = shareDetail();
    const native = window.navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    try {
      if (typeof native.share === "function") {
        await native.share({ title: "Iqtibosim", text, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Matn nusxalandi");
      }
    } catch {
      // user cancelled the native share sheet: ignore
    }
    setMenuOpen(false);
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Havola nusxalandi");
    } catch {
      toast.error("Nusxalash imkoni bo'lmadi");
    }
    setMenuOpen(false);
  }

  // --- Collections ("To'plamga qo'shish") -------------------------------

  // Session-local membership overrides; a collection is a member if it either
  // was listed as containing this quote (preview heuristic) or the user added
  // it here. Kept in sync by toggleCollection below.
  const [memberOverrides, setMemberOverrides] = useState<Set<string>>(new Set());

  function isInCollection(c: QuoteCollection): boolean {
    if (memberOverrides.has(c.id)) return true;
    return c.previewQuotes.some((q) => q.id === quote.id);
  }

  async function openCollectionPicker(): Promise<void> {
    setPickingCollection(true);
    setCollectionsLoading(true);
    setCollections([]);
    try {
      const data = await api<{ collections: QuoteCollection[] }>("/api/collections/mine");
      setCollections(data.collections);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "To'plamlar yuklanmadi");
    } finally {
      setCollectionsLoading(false);
    }
  }

  async function toggleCollection(col: QuoteCollection): Promise<void> {
    if (collectionsBusy) return;
    setCollectionsBusy(true);
    const member = isInCollection(col);
    try {
      if (member) {
        await api<{ ok: boolean }>(`/api/collections/${col.id}/quotes/${quote.id}`, {
          method: "DELETE",
        });
        setMemberOverrides((prev) => {
          const next = new Set(prev);
          next.delete(col.id);
          return next;
        });
        toast.success(t("collection.removed"));
      } else {
        await api<{ ok: boolean }>(`/api/collections/${col.id}/quotes`, {
          method: "POST",
          body: { quoteId: quote.id },
        });
        setMemberOverrides((prev) => new Set(prev).add(col.id));
        toast.success(t("collection.added"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setCollectionsBusy(false);
    }
  }

  async function createCollectionAndAdd(): Promise<void> {
    const title = newCollectTitle.trim();
    if (!title || creatingCollection) return;
    setCreatingCollection(true);
    try {
      const created = await api<{ collection: QuoteCollection }>("/api/collections", {
        method: "POST",
        body: { title, isPrivate: true },
      });
      await api<{ ok: boolean }>(`/api/collections/${created.collection.id}/quotes`, {
        method: "POST",
        body: { quoteId: quote.id },
      });
      if (!isInCollection(created.collection)) {
        setMemberOverrides((prev) => new Set(prev).add(created.collection.id));
      }
      setCollections((prev) => [created.collection, ...prev]);
      setNewCollectTitle("");
      toast.success(t("collection.created"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "To'plam yaratilmadi");
    } finally {
      setCreatingCollection(false);
    }
  }

  const shareButtonClass =
    "inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";

  const shareItemClass =
    "flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

  const [open, close] = quoteMarks(quote.customStyles);

  return (
    <figure
      id={`quote-${quote.id}`}
      className={`animate-slide-up relative scroll-mt-28 rounded-2xl border p-4 shadow-sm sm:p-5 ${
        menuOpen ? "z-30" : ""
      } ${
        highlight
          ? "border-blue-400/70 bg-blue-50/40 shadow-md ring-2 ring-blue-500/60 dark:border-blue-500/60 dark:bg-blue-500/10 dark:shadow-none"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none"
      }`}
      style={quoteCardStyle(quote.customStyles)}
    >
      <blockquote
        className="font-serif text-base leading-relaxed text-slate-800 dark:text-slate-100 md:text-lg"
        style={quoteTextStyle(quote.customStyles)}
      >
        {open && (
          <span className="mr-1 select-none opacity-70" aria-hidden="true">
            {open}
          </span>
        )}
        {quote.text}
        {close && (
          <span className="ml-1 select-none opacity-70" aria-hidden="true">
            {close}
          </span>
        )}
      </blockquote>

      {quote.telegramUrl && <TelegramPost url={quote.telegramUrl} />}

      <figcaption className="mt-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate font-medium text-slate-700 dark:text-slate-300">{quote.displayAuthor}</span>
          <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">{formatDate(quote.createdAt)}</span>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {quote.category.name}
        </span>
      </figcaption>

      {quote.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {quote.tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/?tag=${encodeURIComponent(tag.slug)}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition"
            >
              <span aria-hidden="true">#</span>
              <span>{tag.name}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 sm:gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleLike()}
          aria-pressed={liked}
          className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
            liked
              ? "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          <svg className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20l7.682-7.318a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
          <span>{likeCount}</span>
        </button>

        <span className="inline-flex min-h-[40px] items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          {quote.views ?? 0}
        </span>

        <TtsButton text={quote.text} lang={quote.locale?.toLowerCase() ?? "uz"} />

        <div ref={menuRef} className="relative ml-auto flex items-center">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={t("share.button")}
            className={shareButtonClass}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span>{t("share.button")}</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-3 w-3 transition-transform ${menuOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {menuOpen &&
            (pickingCollection ? (
              <div
                className="animate-pop-in absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => {
                    setPickingCollection(false);
                    setCollections([]);
                  }}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  {t("share.button")}
                </button>

                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                <div className="px-1 pb-1">
                  <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {t("collection.myCollections")}
                  </p>

                  {collectionsLoading ? (
                    <p className="px-2 py-2 text-xs text-slate-400 dark:text-slate-500">{t("common.loading")}</p>
                  ) : collections.length === 0 ? (
                    <p className="px-2 py-2 text-xs text-slate-400 dark:text-slate-500">{t("collection.currentlyEmpty")}</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto">
                      {collections.map((col) => {
                        const member = isInCollection(col);
                        return (
                          <button
                            key={col.id}
                            type="button"
                            disabled={collectionsBusy}
                            onClick={() => void toggleCollection(col)}
                            className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            <span className="truncate">{col.title}</span>
                            <span
                              className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${
                                member
                                  ? "border-blue-600 bg-blue-600 text-white"
                                  : "border-slate-300 text-transparent dark:border-slate-600"
                              }`}
                              aria-hidden="true"
                            >
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void createCollectionAndAdd();
                    }}
                    className="mt-2 flex gap-2"
                  >
                    <input
                      value={newCollectTitle}
                      onChange={(e) => setNewCollectTitle(e.target.value)}
                      maxLength={120}
                      placeholder={t("share.newCollection")}
                      className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={creatingCollection || !newCollectTitle.trim()}
                      className="min-h-[40px] shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 dark:hover:bg-blue-500"
                    >
                      {creatingCollection ? "..." : t("collection.create")}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
            <div
              role="menu"
              className="animate-pop-in absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            >
              <button type="button" onClick={() => void shareAsImage()} className={shareItemClass}>
                <svg className="h-4 w-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 15-5-5L5 21" />
                </svg>
                <span>{t("share.image")}</span>
              </button>
              <button type="button" onClick={() => void shareTextClipboard()} className={shareItemClass}>
                <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 5H6a2 2 0 00-2 2v8a2 2 0 002 2h9a2 2 0 002-2v-6l-4-4z"
                  />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5v4h4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="m13.5 12.5-4 4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 16.5h2.5V14" />
                </svg>
                <span>{t("share.text")}</span>
              </button>
              <button type="button" onClick={() => shareOn("telegram")} className={shareItemClass}>
                <svg className="h-4 w-4 text-sky-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M21.94 3.62c.28-1.12-.85-2-1.87-1.57L2.2 9.03c-1.17.5-1.1 2.1.12 2.5l4.88 1.6 1.9 6.05c.36 1.15 1.86 1.46 2.65.54l2.44-2.83 4.79 3.52c.95.7 2.34.2 2.57-1.06l2.39-14.13z" />
                </svg>
                <span>{t("share.telegram")}</span>
              </button>
              <button type="button" onClick={() => shareOn("whatsapp")} className={shareItemClass}>
                <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07a8.16 8.16 0 01-2.37-1.47 8.92 8.92 0 01-1.64-2.03c-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.2 5.1 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.58-.09 1.76-.72 2-1.42.25-.7.25-1.3.18-1.42-.07-.13-.27-.2-.57-.35zM12.05 21.8h-.01a9.87 9.87 0 01-5.03-1.38l-.36-.21-3.74.98 1-3.64-.24-.37a9.86 9.86 0 01-1.51-5.26c0-5.45 4.44-9.88 9.9-9.88a9.83 9.83 0 016.99 2.9 9.83 9.83 0 012.9 7 9.9 9.9 0 01-9.9 9.86zm8.42-18.27A11.81 11.81 0 0012.04 0C5.5 0 .17 5.33.16 11.88c0 2.1.55 4.14 1.6 5.94L0 24l6.33-1.66a11.87 11.87 0 005.68 1.45h.01c6.54 0 11.87-5.33 11.88-11.88 0-3.18-1.24-6.16-3.43-8.38z" />
                </svg>
                <span>{t("share.whatsapp")}</span>
              </button>
              <button type="button" onClick={() => void copyLink()} className={shareItemClass}>
                <svg className="h-4 w-4 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                <span>{t("share.copyLink")}</span>
              </button>
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <button type="button" onClick={() => void openCollectionPicker()} className={shareItemClass}>
                <svg className="h-4 w-4 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 6c-4 0-6 4-6 4s-2 4 6 4 6-4 6-4 2-4-6-4z" />
                  <path d="M12 12a2 2 0 100-4 2 2 0 000 4z" />
                  <circle cx="12" cy="15" r="1.5" />
                </svg>
                <span>{t("share.addToCollection")}</span>
              </button>
            </div>
            ))}
        </div>
      </div>

      {showStatus && quote.status && (
        <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <StatusBadge status={quote.status} />
          {quote.status === "REJECTED" && quote.rejectionReason && (
            <span className="text-xs text-slate-500 dark:text-slate-400">Sabab: {quote.rejectionReason}</span>
          )}
        </div>
      )}
    </figure>
  );
}