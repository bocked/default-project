"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  AdminCard,
  Badge,
  EmptyState,
  PageTitle,
} from "@/components/admin-ui";
import type { ActivityPoint, AdminLogEntry, AdminStats, TopQuotes } from "@/lib/types";

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activity, setActivity] = useState<ActivityPoint[]>([]);
  const [logs, setLogs] = useState<AdminLogEntry[]>([]);
  const [topQuotes, setTopQuotes] = useState<TopQuotes | null>(null);

  useEffect(() => {
    void api<AdminStats>("/api/admin/stats").then(setStats).catch(() => setStats(null));
    void api<{ activity: ActivityPoint[] }>("/api/admin/stats/activity?days=14")
      .then((d) => setActivity(d.activity))
      .catch(() => setActivity([]));
    void api<{ logs: AdminLogEntry[] }>("/api/admin/logs?limit=8")
      .then((d) => setLogs(d.logs))
      .catch(() => setLogs([]));
    void api<TopQuotes>("/api/admin/stats/top-quotes?days=30&limit=5")
      .then(setTopQuotes)
      .catch(() => setTopQuotes(null));
  }, []);

  const cards = [
    { label: "Kutilmoqda", value: stats?.quotes.pending ?? 0, tone: "amber" as const },
    { label: "Tasdiqlangan", value: stats?.quotes.approved ?? 0, tone: "emerald" as const },
    { label: "Rad etilgan", value: stats?.quotes.rejected ?? 0, tone: "rose" as const },
    { label: "Foydalanuvchilar", value: stats?.users ?? 0, tone: "blue" as const },
    { label: "Bloklangan", value: stats?.blockedUsers ?? 0, tone: "rose" as const },
    { label: "Arxivdagi iqtiboslar", value: stats?.deletedQuotes ?? 0, tone: "slate" as const },
    { label: "Onlayn", value: stats?.online ?? 0, tone: "blue" as const },
  ];

  const WWW_UZ_STATS_URL = "https://www.uz/stat/48123";

  return (
    <div className="space-y-6">
      <PageTitle
        title="Boshqaruv paneli"
        subtitle="Sayt faoliyati va moderatsiya holati."
        actions={
          <Link
            href="/admin/quotes"
            className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
          >
            Kutilayotgan iqtiboslar
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        {cards.map((card) => (
          <AdminCard key={card.label} className="p-4">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{card.value}</p>
            <div className="mt-1">
              <Badge tone={card.tone}>{card.label}</Badge>
            </div>
          </AdminCard>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <AdminCard className="lg:col-span-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            So&apos;nggi 14 kunlik faollik
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Kunlik ro&apos;yxatdan o&apos;tishlar va iqtiboslar.
          </p>
          <ActivityChart data={activity} />
        </AdminCard>

        <AdminCard className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">WWW.UZ Statistikasi</h2>
            <a
              href={WWW_UZ_STATS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Batafsil
            </a>
          </div>
          <div className="mt-3 space-y-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Sayt tashrif buyuruvchilari, ko&apos;rishlar va trafik manbalari haqida batafsil statistika www.uz saytida mavjud.
              </p>
              <a
                href={WWW_UZ_STATS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <span>www.uz statistikasini ko&apos;rish</span>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Saytga yashirin o&apos;rnatilgan www.uz hisoblagich (ID: 48123) har bir tashrifni yuzagachi rejimda qayd etadi.
              </p>
            </div>
          </div>
        </AdminCard>

        <AdminCard className="lg:col-span-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Top iqtiboslar (30 kun)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Eng ko&apos;p o&apos;qilgan va yoqqan iqtiboslar.
          </p>
          <TopQuotesList data={topQuotes} />
        </AdminCard>

        <AdminCard className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">So&apos;nggi hodisalar</h2>
            <Link href="/admin/logs" className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
              Barchasi
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {logs.length === 0 && <EmptyState text="Hodisalar yo'q." />}
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500">
                  {new Date(log.time).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span
                  className={
                    log.level === "ban"
                      ? "text-rose-600 dark:text-rose-400"
                      : log.level === "delete"
                        ? "text-rose-600 dark:text-rose-400"
                        : log.level === "warn"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-slate-600 dark:text-slate-300"
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </AdminCard>
      </div>
    </div>
  );
}

function TopQuotesList({ data }: { data: TopQuotes | null }) {
  if (!data || (data.mostRead.length === 0 && data.mostLiked.length === 0)) {
    return <EmptyState text="Hozircha ma'lumot yo'q." />;
  }
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Eng ko&apos;p o&apos;qilgan</p>
        <div className="space-y-2">
          {data.mostRead.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">Ma&apos;lumot yo&apos;q</p>}
          {data.mostRead.map((q, i) => (
            <div key={q.id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-blue-100 font-bold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-slate-700 dark:text-slate-200">{q.text}</p>
                <p className="mt-0.5 text-slate-400 dark:text-slate-500">
                  {q.views ?? 0} ko&apos;rish · {q.displayAuthor}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Eng ko&apos;p yoqqan</p>
        <div className="space-y-2">
          {data.mostLiked.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500">Ma&apos;lumot yo&apos;q</p>}
          {data.mostLiked.map((q, i) => (
            <div key={q.id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-rose-100 font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-slate-700 dark:text-slate-200">{q.text}</p>
                <p className="mt-0.5 text-slate-400 dark:text-slate-500">
                  {q.likeCount ?? 0} layk · {q.displayAuthor}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActivityChart({ data }: { data: ActivityPoint[] }) {
  if (data.length === 0) {
    return <EmptyState text="Statistika mavjud emas." />;
  }
  const max = Math.max(1, ...data.map((d) => Math.max(d.registrations, d.quotes)));
  const width = 560;
  const height = 180;
  const pad = 22;
  const chartW = width - pad * 2;
  const chartH = height - pad * 2;
  const barW = Math.max(4, (chartW / data.length) * 0.3);
  const step = chartW / data.length;

  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Faollik grafigi">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={width - pad}
            y1={pad + chartH * (1 - f)}
            y2={pad + chartH * (1 - f)}
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth="1"
          />
        ))}
        {data.map((d, i) => {
          const x = pad + i * step + step / 2;
          const regH = (d.registrations / max) * chartH;
          const quoteH = (d.quotes / max) * chartH;
          return (
            <g key={d.date}>
              <rect
                x={x - barW - 1.5}
                y={pad + chartH - regH}
                width={barW}
                height={Math.max(regH, 1)}
                rx="2"
                className="fill-blue-500"
              />
              <rect
                x={x + 1.5}
                y={pad + chartH - quoteH}
                width={barW}
                height={Math.max(quoteH, 1)}
                rx="2"
                className="fill-emerald-500"
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> Ro&apos;yxatdan o&apos;tish
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Iqtiboslar
        </span>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
