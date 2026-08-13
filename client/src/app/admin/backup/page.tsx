"use client";

import { useCallback, useEffect, useState } from "react";
import { api, tokenStore } from "@/lib/api";
import { config } from "@/lib/config";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  Badge,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { BackupRecord } from "@/lib/types";

export default function AdminBackupPage() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ backups: BackupRecord[] }>("/api/admin/backups");
      setBackups(data.backups);
    } catch {
      setError("Zaxiralarni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function create(): Promise<void> {
    const l = label.trim() || `Avtomatik zaxira (${new Date().toLocaleString("uz-UZ")})`;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api<{ backup: BackupRecord }>("/api/admin/backups", {
        method: "POST",
        body: { label: l },
      });
      setLabel("");
      setNotice("Zaxira yaratildi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zaxira yaratilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function restore(backup: BackupRecord): Promise<void> {
    if (
      !window.confirm(
        `"${backup.label}" zaxirasini tiklashni tasdiqlaysizmi?\nBo'limlar, heshteglar, kontent va sozlamalar qayta tiklanadi.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await api<{ ok: boolean; restored: Record<string, number> }>(
        `/api/admin/backups/${backup.id}/restore`,
        { method: "POST" }
      );
      setNotice(`Tiklandi: ${JSON.stringify(data.restored)}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zaxira tiklanmadi");
    } finally {
      setBusy(false);
    }
  }

  async function remove(backup: BackupRecord): Promise<void> {
    if (!window.confirm(`"${backup.label}" zaxirasini o'chirishni tasdiqlaysizmi?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/backups/${backup.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zaxira o'chirilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function download(backup: BackupRecord): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const token = tokenStore.get();
      const res = await fetch(`${config.url}/api/admin/backups/${backup.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Yuklab olish muvaffaqiyatsiz (${res.status})`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `backup-${backup.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setNotice("Zaxira yuklab olindi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zaxira yuklab olinmadi");
    } finally {
      setBusy(false);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Zaxira (Backup)"
        subtitle="Ma'lumotlar bazasi zaxirasi va tiklash."
      />

      {notice && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      )}
      {error && <ErrorNote text={error} />}

      <AdminCard>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Yangi zaxira yaratish</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Foydalanuvchilar, iqtiboslar, bo&apos;limlar, heshteglar, kontent va sozlamalar JSON sifatida saqlanadi.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <AdminInput
            placeholder="Zaxira nomi (ixtiyoriy)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1"
          />
          <AdminButton disabled={busy} onClick={() => void create()}>
            Zaxira yaratish
          </AdminButton>
        </div>
      </AdminCard>

      {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}
      {!busy && backups.length === 0 && <EmptyState text="Zaxiralar yo'q." />}

      <div className="space-y-2">
        {backups.map((backup) => (
          <AdminCard key={backup.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white">{backup.label}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>{new Date(backup.createdAt).toLocaleString("uz-UZ")}</span>
                <Badge tone="slate">{formatSize(backup.size)}</Badge>
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <AdminButton variant="slate" disabled={busy} onClick={() => void download(backup)}>
                Yuklab olish
              </AdminButton>
              <AdminButton variant="success" disabled={busy} onClick={() => void restore(backup)}>
                Tiklash
              </AdminButton>
              <AdminButton variant="ghost" disabled={busy} onClick={() => void remove(backup)}>
                O&apos;chirish
              </AdminButton>
            </div>
          </AdminCard>
        ))}
      </div>
    </div>
  );
}
