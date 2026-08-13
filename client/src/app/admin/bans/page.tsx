"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  Badge,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { TelegramBanUser } from "@/lib/types";

interface BanRecord {
  id: string;
  ipAddress: string;
  reason: string | null;
  createdAt: string;
}

type Tab = "ip" | "telegram";

export default function AdminBansPage() {
  const [tab, setTab] = useState<Tab>("ip");
  const [ips, setIps] = useState<BanRecord[]>([]);
  const [tgUsers, setTgUsers] = useState<TelegramBanUser[]>([]);
  const [ipAddress, setIpAddress] = useState("");
  const [ipReason, setIpReason] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const [tgReason, setTgReason] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIps = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ bans: BanRecord[] }>("/api/admin/bans");
      setIps(data.bans);
    } catch {
      setError("Qora ro'yxatni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadTg = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const data = await api<{ users: TelegramBanUser[] }>(`/api/admin/bans/telegram?${params.toString()}`);
      setTgUsers(data.users);
    } catch {
      setError("Telegram qora ro'yxatini yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, [search]);

  useEffect(() => {
    if (tab === "ip") {
      const t = window.setTimeout(() => void loadIps(), 0);
      return () => window.clearTimeout(t);
    }
  }, [tab, loadIps]);

  useEffect(() => {
    if (tab === "telegram") {
      const t = window.setTimeout(() => void loadTg(), 0);
      return () => window.clearTimeout(t);
    }
  }, [tab, loadTg]);

  async function banIp(): Promise<void> {
    const value = ipAddress.trim();
    if (!value) {
      window.alert("IP manzil kiriting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<{ ban: BanRecord }>("/api/admin/bans", {
        method: "POST",
        body: { ipAddress: value, reason: ipReason.trim() || undefined },
      });
      setIpAddress("");
      setIpReason("");
      await loadIps();
    } catch (err) {
      setError(err instanceof Error ? err.message : "IP bloklanmadi");
    } finally {
      setBusy(false);
    }
  }

  async function unbanIp(ip: string): Promise<void> {
    if (!window.confirm(`${ip} manzilini qora ro'yxatdan chiqarishni tasdiqlaysizmi?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/bans/${encodeURIComponent(ip)}`, { method: "DELETE" });
      await loadIps();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bloklash bekor qilinmadi");
    } finally {
      setBusy(false);
    }
  }

  async function banTelegram(): Promise<void> {
    const value = telegramId.trim();
    if (!value) {
      window.alert("Telegram ID kiriting.");
      return;
    }
    if (!window.confirm(`${value} Telegram ID'li barcha hisoblarni bloklashni tasdiqlaysizmi?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>("/api/admin/bans/telegram", {
        method: "POST",
        body: { telegramId: value, reason: tgReason.trim() || undefined },
      });
      setTelegramId("");
      setTgReason("");
      await loadTg();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bloklash amalga oshmadi");
    } finally {
      setBusy(false);
    }
  }

  async function unbanTelegram(userId: string): Promise<void> {
    if (!window.confirm("Hisobni qora ro'yxatdan chiqarishni tasdiqlaysizmi?")) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/bans/telegram/${userId}`, { method: "DELETE" });
      await loadTg();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bloklash bekor qilinmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Qora ro'yxat"
        subtitle="IP manzillar va Telegram ID bo'yicha bloklangan foydalanuvchilar."
      />

      <div className="flex gap-1.5">
        <TabButton active={tab === "ip"} onClick={() => setTab("ip")}>
          IP manzillar ({ips.length})
        </TabButton>
        <TabButton active={tab === "telegram"} onClick={() => setTab("telegram")}>
          Telegram ID ({tgUsers.length})
        </TabButton>
      </div>

      {error && <ErrorNote text={error} />}

      {tab === "ip" && (
        <>
          <AdminCard>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">IP manzilni bloklash</h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <AdminInput
                placeholder="Masalan: 192.168.1.1"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                className="sm:max-w-[200px]"
              />
              <AdminInput
                placeholder="Sabab (ixtiyoriy)"
                value={ipReason}
                onChange={(e) => setIpReason(e.target.value)}
                className="flex-1"
              />
              <AdminButton variant="danger" disabled={busy} onClick={() => void banIp()}>
                Bloklash
              </AdminButton>
            </div>
          </AdminCard>

          {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}
          {!busy && ips.length === 0 && <EmptyState text="Bloklangan IP manzillar yo'q." />}

          <div className="space-y-2">
            {ips.map((ban) => (
              <AdminCard key={ban.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-medium text-slate-900 dark:text-white">{ban.ipAddress}</p>
                  {ban.reason && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Sabab: {ban.reason}</p>}
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {new Date(ban.createdAt).toLocaleString("uz-UZ")}
                  </p>
                </div>
                <AdminButton variant="ghost" disabled={busy} onClick={() => void unbanIp(ban.ipAddress)}>
                  Qora ro&apos;yxatdan chiqarish
                </AdminButton>
              </AdminCard>
            ))}
          </div>
        </>
      )}

      {tab === "telegram" && (
        <>
          <AdminCard>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Telegram ID bo&apos;yicha bloklash</h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <AdminInput
                placeholder="Telegram ID (masalan: 123456789)"
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                className="sm:max-w-[220px]"
              />
              <AdminInput
                placeholder="Sabab (ixtiyoriy)"
                value={tgReason}
                onChange={(e) => setTgReason(e.target.value)}
                className="flex-1"
              />
              <AdminButton variant="danger" disabled={busy} onClick={() => void banTelegram()}>
                Bloklash
              </AdminButton>
            </div>
          </AdminCard>

          <AdminInput
            placeholder="Telegram ID yoki email bo'yicha qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />

          {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}
          {!busy && tgUsers.length === 0 && <EmptyState text="Bloklangan foydalanuvchilar yo'q." />}

          <div className="space-y-2">
            {tgUsers.map((u) => (
              <AdminCard key={u.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                    {u.telegramId}
                    <Badge tone="rose">Bloklangan</Badge>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {u.nickname || u.name || u.email || "Telegram foydalanuvchisi"}
                  </p>
                </div>
                <AdminButton variant="ghost" disabled={busy} onClick={() => void unbanTelegram(u.id)}>
                  Qora ro&apos;yxatdan chiqarish
                </AdminButton>
              </AdminCard>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
