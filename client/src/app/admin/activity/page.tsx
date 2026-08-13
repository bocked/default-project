"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  AdminCard,
  AdminInput,
  AdminSelect,
  Badge,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { AdminActivityEntry } from "@/lib/types";

const ACTIONS: Record<string, { label: string; tone: "blue" | "emerald" | "slate" | "amber" | "rose" }> = {
  REGISTER: { label: "Ro'yxatdan o'tish", tone: "emerald" },
  LOGIN: { label: "Kirish", tone: "blue" },
  QUOTE_CREATE: { label: "Iqtibos qo'shish", tone: "amber" },
  QUOTE_LIKE: { label: "Layk", tone: "slate" },
  QUOTE_COMMENT: { label: "Izoh", tone: "slate" },
  PROFILE_UPDATE: { label: "Profil tahriri", tone: "slate" },
  FEEDBACK: { label: "Shikoyat", tone: "rose" },
};

export default function AdminActivityPage() {
  const [activities, setActivities] = useState<AdminActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const load = useCallback(
    async (query: string, act: string) => {
      setBusy(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (act) params.set("action", act);
        params.set("limit", "200");
        const data = await api<{ activities: AdminActivityEntry[]; total: number }>(
          `/api/admin/activity?${params.toString()}`
        );
        setActivities(data.activities);
        setTotal(data.total);
      } catch {
        setError("Faoliyatni yuklab bo'lmadi");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void load(q, action), 300);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [load, q, action]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Foydalanuvchi faolligi"
        subtitle="Ro'yxatdan o'tish, kirish, iqtibos va layk harakatlari."
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <AdminInput
          placeholder="Email yoki nickname bo'yicha qidirish..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-xs"
        />
        <AdminSelect value={action} onChange={(e) => setAction(e.target.value)} className="sm:max-w-[220px]">
          <option value="">Barcha harakatlar</option>
          {Object.entries(ACTIONS).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </AdminSelect>
      </div>

      {error && <ErrorNote text={error} />}
      {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}
      {!busy && activities.length === 0 && <EmptyState text="Faoliyat ma'lumotlari yo'q." />}

      <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
        <span>Jami: {total} ta hodisa</span>
        <span>Oxirgi 200 ta ko&apos;rsatilmoqda</span>
      </div>

      <div className="space-y-2">
        {activities.map((a) => {
          const meta = ACTIONS[a.action] ?? { label: a.action, tone: "slate" as const };
          return (
            <AdminCard key={a.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    {a.user ? a.user.nickname || a.user.name || a.user.email : "Noma'lum"}
                  </span>
                  {a.detail && (
                    <span className="truncate text-xs text-slate-500 dark:text-slate-400">{a.detail}</span>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                {new Date(a.createdAt).toLocaleString("uz-UZ")}
              </span>
            </AdminCard>
          );
        })}
      </div>
    </div>
  );
}
