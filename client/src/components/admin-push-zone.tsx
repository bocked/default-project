"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminSocket } from "@/lib/realtime";

interface PushBanner {
  id: string;
  tone: "amber" | "blue";
  title: string;
  detail?: string;
  href: string;
}

const MAX_BANNERS = 2;

/**
 * Live push feed for the admin panel. Listens on the panel socket for
 * `admin:policy:review` (a policy draft was auto-prepared) and
 * `admin:feature:new` (a runtime module registered itself) and renders a
 * dismissible banner linking into the Policies console.
 */
export function AdminPushZone() {
  const [banners, setBanners] = useState<PushBanner[]>([]);

  useEffect(() => {
    const socket = adminSocket();
    const timers: number[] = [];

    const add = (banner: PushBanner, ttlMs = 12000): void => {
      setBanners((prev) => {
        if (prev.some((b) => b.id === banner.id)) return prev;
        return [...prev, banner].slice(-MAX_BANNERS);
      });
      timers.push(window.setTimeout(() => {
        setBanners((prev) => prev.filter((b) => b.id !== banner.id));
      }, ttlMs));
    };

    const onPolicyReview = (payload: unknown): void => {
      const p = (payload ?? {}) as { id?: string; type?: string; version?: string; reason?: string; changeSummary?: string | null };
      add({
        id: `policy:${p.id ?? "unknown"}`,
        tone: "amber",
        title: `Siyosat ko'rib chiqish talab etiladi (v${p.version ?? "—"})`,
        detail: p.reason ?? p.changeSummary ?? undefined,
        href: "/admin/policies",
      });
    };

    const onFeatureNew = (payload: unknown): void => {
      const p = (payload ?? {}) as { key?: string; label?: string; description?: string };
      add({
        id: `feature:${p.key ?? "unknown"}`,
        tone: "blue",
        title: `Yangi modul aniqlandi: ${p.label ?? p.key ?? "?"}`,
        detail: p.description,
        href: "/admin/policies",
      });
    };

    socket.on("admin:policy:review", onPolicyReview);
    socket.on("admin:feature:new", onFeatureNew);
    return () => {
      socket.off("admin:policy:review", onPolicyReview);
      socket.off("admin:feature:new", onFeatureNew);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  if (banners.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {banners.map((b) => (
        <div
          key={b.id}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm ${
            b.tone === "amber"
              ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200"
              : "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-200"
          }`}
        >
          <div className="min-w-0">
            <p className="font-semibold">{b.title}</p>
            {b.detail && <p className="mt-0.5 truncate text-xs opacity-80">{b.detail}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href={b.href}
              className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Ko&apos;rib chiqish
            </Link>
            <button
              type="button"
              aria-label="Yopish"
              onClick={() => setBanners((prev) => prev.filter((x) => x.id !== b.id))}
              className="rounded-lg px-2 py-1 text-xs opacity-70 transition hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}