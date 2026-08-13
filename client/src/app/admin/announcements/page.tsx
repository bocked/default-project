"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminSelect,
  AdminTextarea,
  Badge,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { AdminAnnouncement } from "@/lib/types";

const CHANNELS: Record<string, string> = {
  SITE: "Sayt",
  TELEGRAM: "Telegram",
  EMAIL: "Email",
  ALL: "Hammasi",
};

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("ALL");
  const [status, setStatus] = useState("ACTIVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ announcements: AdminAnnouncement[] }>("/api/admin/announcements");
      setAnnouncements(data.announcements);
    } catch {
      setError("E'lonlarni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function create(): Promise<void> {
    const t = title.trim();
    const m = message.trim();
    if (!t || !m) {
      window.alert("Sarlavha va matn to'ldirilishi shart.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api<{ announcement: AdminAnnouncement }>("/api/admin/announcements", {
        method: "POST",
        body: { title: t, message: m, channel, status },
      });
      setTitle("");
      setMessage("");
      setStatus("ACTIVE");
      setNotice(
        channel === "SITE"
          ? "E'lon saytda ko'rsatilmoqda."
          : channel === "TELEGRAM"
            ? "E'lon Telegram orqali yuborildi."
            : channel === "EMAIL"
              ? "E'lon email orqali yuborildi."
              : "E'lon saytda ko'rsatiladi, Telegram va email orqali yuborildi."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "E'lon yaratilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, next: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ announcement: AdminAnnouncement }>(`/api/admin/announcements/${id}`, {
        method: "PATCH",
        body: { status: next },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Holat o'zgartirilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, title: string): Promise<void> {
    if (!window.confirm(`"${title}" e'lonini o'chirishni tasdiqlaysizmi?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/announcements/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "E'lon o'chirilmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="E'lonlar"
        subtitle="Sayt, Telegram va email orqali foydalanuvchilarga xabar yuborish."
      />

      {notice && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      )}
      {error && <ErrorNote text={error} />}

      <AdminCard>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Yangi e&apos;lon</h2>
        <div className="mt-3 space-y-3">
          <AdminInput
            placeholder="Sarlavha"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
          <AdminTextarea
            placeholder="E'lon matni..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={4000}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Kanal</label>
              <AdminSelect value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full">
                {Object.entries(CHANNELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Holat</label>
              <AdminSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-full">
                <option value="ACTIVE">Faol</option>
                <option value="ARCHIVED">Arxivlangan</option>
              </AdminSelect>
            </div>
            <AdminButton disabled={busy} onClick={() => void create()}>
              Yuborish
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}
      {!busy && announcements.length === 0 && <EmptyState text="E'lonlar yo'q." />}

      <div className="space-y-3">
        {announcements.map((a) => (
          <AdminCard key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{a.title}</h3>
                  <Badge tone={a.status === "ACTIVE" ? "emerald" : "slate"}>
                    {a.status === "ACTIVE" ? "Faol" : "Arxivlangan"}
                  </Badge>
                  <Badge tone="blue">{CHANNELS[a.channel] ?? a.channel}</Badge>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{a.message}</p>
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  {new Date(a.createdAt).toLocaleString("uz-UZ")}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <AdminButton
                  variant="slate"
                  disabled={busy}
                  onClick={() => void toggle(a.id, a.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE")}
                >
                  {a.status === "ACTIVE" ? "Arxivlash" : "Faollashtirish"}
                </AdminButton>
                <AdminButton variant="ghost" disabled={busy} onClick={() => void remove(a.id, a.title)}>
                  O&apos;chirish
                </AdminButton>
              </div>
            </div>
          </AdminCard>
        ))}
      </div>
    </div>
  );
}
