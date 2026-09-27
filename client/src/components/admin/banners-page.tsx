"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { AdminButton, AdminCard, EmptyState, ErrorNote, PageTitle } from "@/components/admin-ui";
import { AdminBannerForm, Toggle, type SlotDraft } from "@/components/admin/banner-form";
import type { BannerSlot } from "@/config/banners";

const TABS = [
  { id: "left", label: "⬅️ Chap Yon Banner (Desktop)" },
  { id: "right", label: "➡️ O'ng Yon Banner (Desktop)" },
  { id: "mobile", label: "📱 Mobil Bannerlar" },
  { id: "feed", label: "📰 Feed Ichidagi Reklama" },
  { id: "stats", label: "📊 Statistika" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SLOTS: BannerSlot[] = ["left", "right", "top", "feed", "bottom"];

interface BannerStatsRow {
  slot: BannerSlot;
  views: number;
  clicks: number;
  ctr: number;
}

function emptyDraft(): SlotDraft {
  return { enabled: true, type: "image", html: "", image: "", href: "", alt: "", every: "4" };
}

function draftsEqual(a: SlotDraft, b: SlotDraft): boolean {
  return (
    a.enabled === b.enabled &&
    a.type === b.type &&
    a.html === b.html &&
    a.image === b.image &&
    a.href === b.href &&
    a.alt === b.alt &&
    a.every === b.every
  );
}

function bannerTitle(slot: BannerSlot): string {
  switch (slot) {
    case "left":
      return "Chap yon banner";
    case "right":
      return "O'ng yon banner";
    case "top":
      return "Ustki banner";
    case "bottom":
      return "Pastki panel banneri";
    case "feed":
      return "Feed ichidagi reklama";
  }
}

function deviceLabel(slot: BannerSlot): string {
  return slot === "top" || slot === "bottom" ? "Mobil qurilmalar" : slot === "feed" ? "Feed (mobil/desktop)" : "Desktop";
}

function StatBox({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-700 dark:bg-slate-800/60">
      <div className="text-lg leading-none">{icon}</div>
      <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

export function AdminBannersPage() {
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(true);
  const [masterOn, setMasterOn] = useState(true);
  const [drafts, setDrafts] = useState<Record<BannerSlot, SlotDraft>>({
    left: emptyDraft(),
    right: emptyDraft(),
    top: emptyDraft(),
    feed: emptyDraft(),
    bottom: emptyDraft(),
  });
  const [saved, setSaved] = useState<Record<BannerSlot, SlotDraft>>(drafts);
  const [active, setActive] = useState<TabId>("left");
  const [saving, setSaving] = useState(false);
  const [savingMaster, setSavingMaster] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [outerStats, setOuterStats] = useState<BannerStatsRow[] | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ blocks: Array<{ key: string; value: string }> }>("/api/admin/content");
      const byKey = Object.fromEntries(data.blocks.map((b) => [b.key, b.value]));

      const next = {} as Record<BannerSlot, SlotDraft>;
      for (const slot of SLOTS) {
        const html = byKey[`banner.${slot}.html`] ?? "";
        const typeRaw = byKey[`banner.${slot}.type`];
        next[slot] = {
          enabled: byKey[`banner.${slot}.enabled`] !== "0",
          type: typeRaw === "image" || typeRaw === "code" ? typeRaw : html.trim() !== "" ? "code" : "image",
          html,
          image: byKey[`banner.${slot}.image`] ?? "",
          href: byKey[`banner.${slot}.href`] ?? "",
          alt: byKey[`banner.${slot}.alt`] ?? "",
          every: byKey[`banner.feed.every`] ?? "4",
        };
      }
      setDrafts(next);
      setSaved(structuredClone(next));
      setMasterOn(byKey["banner.enabled"] !== "0");
      setLoaded(true);
    } catch {
      setError("Banner sozlamalarini yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  function patch(slot: BannerSlot, next: SlotDraft): void {
    setDrafts((prev) => ({ ...prev, [slot]: next }));
  }

  const dirtyBySlot = useMemo(() => {
    const map: Record<BannerSlot, boolean> = { left: false, right: false, top: false, feed: false, bottom: false };
    for (const slot of SLOTS) map[slot] = !draftsEqual(drafts[slot], saved[slot]);
    return map;
  }, [drafts, saved]);

  async function saveSlots(slots: BannerSlot[]): Promise<void> {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      for (const slot of slots) {
        const d = drafts[slot];
        const writes: Array<{ key: string; value: string }> = [
          { key: `banner.${slot}.enabled`, value: d.enabled ? "1" : "0" },
          { key: `banner.${slot}.type`, value: d.type },
          { key: `banner.${slot}.html`, value: d.html },
          { key: `banner.${slot}.image`, value: d.image },
          { key: `banner.${slot}.href`, value: d.href },
          { key: `banner.${slot}.alt`, value: d.alt },
        ];
        if (slot === "feed") {
          const every = Number(d.every);
          writes.push({ key: "banner.feed.every", value: Number.isInteger(every) && every >= 1 ? String(every) : "4" });
        }
        for (const w of writes) {
          await api<{ ok: boolean }>(`/api/admin/content/${w.key}`, { method: "PUT", body: { value: w.value } });
        }
      }
      setSaved(structuredClone(drafts));
      setNotice("O'zgarishlar saqlandi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "O'zgarishlar saqlanmadi");
    } finally {
      setSaving(false);
    }
  }

  async function saveMaster(): Promise<void> {
    setSavingMaster(true);
    setError(null);
    setNotice(null);
    try {
      await api<{ ok: boolean }>("/api/admin/content/banner.enabled", {
        method: "PUT",
        body: { value: masterOn ? "1" : "0" },
      });
      setNotice(masterOn ? "Global kalit yoqildi — bannerlar ko'rsatiladi." : "Global kalit o'chirildi — bannerlar yashirildi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Global kalit saqlanmadi");
    } finally {
      setSavingMaster(false);
    }
  }

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const data = await api<{ stats: BannerStatsRow[] }>("/api/admin/banners/stats");
      setOuterStats(data.stats);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : "Statistikani yuklab bo'lmadi");
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active !== "stats" || outerStats !== null) return;
    const t = window.setTimeout(() => void loadStats(), 0);
    return () => window.clearTimeout(t);
  }, [active, outerStats, loadStats]);

  async function resetSlot(slot: BannerSlot): Promise<void> {
    setResetting(slot);
    setStatsError(null);
    try {
      await api<{ ok: boolean }>("/api/admin/banners/stats/reset", {
        method: "POST",
        body: { slot },
      });
      await loadStats();
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : "Statistikani tozalab bo'lmadi");
    } finally {
      setResetting(null);
    }
  }

  if (busy) {
    return <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>;
  }

  if (!loaded) {
    return (
      <div className="space-y-4">
        <PageTitle title="Reklama va bannerlar" subtitle="Saytdagi barcha reklama joylari." />
        {error && <ErrorNote text={error} />}
      </div>
    );
  }

  const tabDirty = (id: TabId): boolean => {
    if (id === "stats") return false;
    return id === "mobile" ? dirtyBySlot.bottom || dirtyBySlot.top : dirtyBySlot[id];
  };

  const tabFooter = (id: TabId, slots: BannerSlot[]) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {tabDirty(id) ? "Saqlanmagan o'zgarishlar bor." : "Barcha o'zgarishlar saqlangan."}
      </span>
      <AdminButton onClick={() => void saveSlots(slots)} disabled={saving || !tabDirty(id)}>
        {saving ? "Saqlanmoqda..." : "O'zgarishlarni saqlash"}
      </AdminButton>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageTitle
        title="Reklama va bannerlar"
        subtitle="Saytdagi barcha reklama joylarini bitta joydan boshqaring."
      />

      {notice && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      )}
      {error && <ErrorNote text={error} />}

      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Barcha bannerlar (global kalit)</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              O&apos;chiq bo&apos;lsa, saytda hech qaysi banner ko&apos;rsatilmaydi.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Toggle
              checked={masterOn}
              label="Barcha bannerlar (global kalit)"
              onChange={(v) => setMasterOn(v)}
            />
            <AdminButton onClick={() => void saveMaster()} disabled={savingMaster}>
              {savingMaster ? "Saqlanmoqda..." : "Saqlash"}
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              active === t.id
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "left" && (
        <div className="space-y-4">
          <AdminBannerForm
            title={bannerTitle("left")}
            description="Desktop'da chap ustunda ko'rsatiladi (katta ekran)."
            hint="Tavsiya etilgan hajm: 160x600 px yoki 240x400 px (vertikal)."
            variant="side"
            draft={drafts.left}
            onChange={(d) => patch("left", d)}
          />
          {tabFooter("left", ["left"])}
        </div>
      )}

      {active === "right" && (
        <div className="space-y-4">
          <AdminBannerForm
            title={bannerTitle("right")}
            description="Desktop'da o'ng ustunda ko'rsatiladi (katta ekran)."
            hint="Tavsiya etilgan hajm: 160x600 px yoki 240x400 px (vertikal)."
            variant="side"
            draft={drafts.right}
            onChange={(d) => patch("right", d)}
          />
          {tabFooter("right", ["right"])}
        </div>
      )}

      {active === "mobile" && (
        <div className="space-y-4">
          <AdminBannerForm
            title={bannerTitle("bottom")}
            description="Mobil'da ekranning pastki qismida (yopish mumkin)."
            hint="Tavsiya etilgan hajm: 320x50 px (gorizontal lenta)."
            variant="bottom"
            draft={drafts.bottom}
            onChange={(d) => patch("bottom", d)}
          />
          <AdminBannerForm
            title={bannerTitle("top")}
            description="Mobil'da header ostida yuqorida ko'rsatiladi."
            hint="Tavsiya etilgan hajm: 320x100 px yoki 728x90 px (gorizontal)."
            variant="top"
            draft={drafts.top}
            onChange={(d) => patch("top", d)}
          />
          {tabFooter("mobile", ["bottom", "top"])}
        </div>
      )}

      {active === "feed" && (
        <div className="space-y-4">
          <AdminBannerForm
            title={bannerTitle("feed")}
            description="Iqtiboslar ro'yxati orasida ko'rsatiladi (mobil/desktop)."
            hint="Tavsiya etilgan hajm: 336x280 px yoki 728x90 px (ogonal)."
            variant="feed"
            showEvery
            draft={drafts.feed}
            onChange={(d) => patch("feed", d)}
          />
          {tabFooter("feed", ["feed"])}
        </div>
      )}

      {active === "stats" && (
        <div className="space-y-4">
          <AdminCard>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Real statistika (MRC Active View)</h3>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Ko&apos;rishlar — banner ekranda kamida 50% ko&apos;rinib 1000ms turganida hisoblanadi
              (faqat haqiqiy reklama kontenti, placeholder emas). Bir tashrifchidan slot&nbsp;uchun soatiga
              ko&apos;pi bilan bitta ko&apos;rish/bosish qayd etiladi; botlar filtrlanadi.
            </p>
          </AdminCard>

          {statsError && <ErrorNote text={statsError} />}

          {statsLoading && outerStats === null && (
            <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Statistika yuklanmoqda...</p>
          )}

          {outerStats !== null && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {outerStats.map((row) => (
                <AdminCard key={row.slot}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{bannerTitle(row.slot)}</h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{deviceLabel(row.slot)}</p>
                    </div>
                    <AdminButton variant="danger" onClick={() => void resetSlot(row.slot)} disabled={resetting === row.slot}>
                      {resetting === row.slot ? "Tozalanmoqda..." : "Tozalash"}
                    </AdminButton>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <StatBox icon="👁️" label="Ko'rishlar" value={row.views.toLocaleString("ru-RU")} />
                    <StatBox icon="👆" label="Bosishlar" value={row.clicks.toLocaleString("ru-RU")} />
                    <StatBox icon="📈" label="CTR" value={`${row.ctr.toFixed(2)}%`} />
                  </div>
                </AdminCard>
              ))}
            </div>
          )}

          {outerStats !== null && outerStats.length === 0 && <EmptyState text="Hozircha statistika yo'q." />}
        </div>
      )}

      {!loaded && <EmptyState text="Banner sozlamalari topilmadi." />}
    </div>
  );
}