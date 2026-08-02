"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CanvasApi } from "@/hooks/useCanvas";
import { config } from "@/lib/config";
import type { AdminLogEntry } from "@/lib/types";

type Tab = "stats" | "items" | "bans" | "logs";

interface AdminStats {
  items: number;
  bans: number;
  online: number;
}

interface AdminItem {
  id: string;
  type: string;
  content: string;
  x: number;
  y: number;
  ipAddress: string;
  createdAt: string;
}

interface BanRecord {
  ipAddress: string;
  reason: string | null;
  createdAt: string;
}

export default function AdminPanel({ api, onClose }: { api: CanvasApi; onClose: () => void }) {
  const { isAdmin, adminLogs, adminAuth, adminBan, adminUnban, adminDeleteItem } = api;

  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState(false);
  const [tab, setTab] = useState<Tab>("stats");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [items, setItems] = useState<AdminItem[]>([]);
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [banIp, setBanIp] = useState("");
  const [banReason, setBanReason] = useState("");
  const [httpLogs, setHttpLogs] = useState<AdminLogEntry[]>([]);

  const mergedLogs = useMemo(() => {
    const byId = new Map<string, AdminLogEntry>();
    for (const l of httpLogs) byId.set(l.id, l);
    for (const l of adminLogs) byId.set(l.id, l);
    return [...byId.values()]
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 200);
  }, [httpLogs, adminLogs]);

  const authedFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`${config.url}${path}`, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${password}`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    [password]
  );

  const refresh = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [s, i, b, l] = await Promise.all([
        authedFetch("/api/admin/stats"),
        authedFetch("/api/admin/items"),
        authedFetch("/api/admin/bans"),
        authedFetch("/api/admin/logs"),
      ]);
      setStats(s);
      setItems(i.items);
      setBans(b.bans);
      setHttpLogs(l.logs);
    } catch {
      /* ignore */
    }
  }, [isAdmin, authedFetch]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const [s, i, b, l] = await Promise.all([
          authedFetch("/api/admin/stats"),
          authedFetch("/api/admin/items"),
          authedFetch("/api/admin/bans"),
          authedFetch("/api/admin/logs"),
        ]);
        if (cancelled) return;
        setStats(s);
        setItems(i.items);
        setBans(b.bans);
        setHttpLogs(l.logs);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, authedFetch]);

  const submitAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(false);
    adminAuth(password);
    setTimeout(() => setAuthError(true), 700);
  };

  const clearCanvas = async () => {
    if (!window.confirm("Butun kustav daftarni tozalashni tasdiqlaysizmi?")) return;
    await authedFetch("/api/admin/items", { method: "DELETE" });
    refresh();
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">🛠 Admin panel</h2>
          <button className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={onClose}>
            ✕
          </button>
        </div>

        {!isAdmin ? (
          <form onSubmit={submitAuth} className="flex flex-col gap-3 p-6">
            <label className="text-sm font-medium text-slate-600">Parol</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              autoFocus
            />
            {authError && <p className="text-xs text-red-500">Parol noto&apos;g&apos;ri</p>}
            <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
              Kirish
            </button>
          </form>
        ) : (
          <>
            <div className="flex gap-1 border-b border-slate-200 px-3 pt-2">
              {(["stats", "items", "bans", "logs"] as Tab[]).map((t) => (
                <button
                  key={t}
                  className={`rounded-t-lg px-3 py-2 text-sm font-medium capitalize ${
                    tab === t ? "border border-b-0 border-slate-200 bg-white text-slate-800" : "text-slate-400 hover:text-slate-600"
                  }`}
                  onClick={() => setTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="min-h-64 flex-1 overflow-auto p-4">
              {tab === "stats" && stats && (
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Elementlar" value={stats.items} />
                  <StatCard label="Bloklangan IP" value={stats.bans} />
                  <StatCard label="Onlayn" value={stats.online} />
                  <button
                    onClick={clearCanvas}
                    className="col-span-3 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                  >
                    Butun kustav daftarni tozalash
                  </button>
                </div>
              )}

              {tab === "items" && (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-slate-400">
                      <th className="pb-2">Tip</th>
                      <th className="pb-2">Kontent</th>
                      <th className="pb-2">X/Y</th>
                      <th className="pb-2">IP</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="py-1.5 font-mono text-xs">{item.type}</td>
                        <td className="max-w-40 truncate py-1.5">{item.content}</td>
                        <td className="py-1.5 font-mono text-xs text-slate-500">
                          {item.x}, {item.y}
                        </td>
                        <td className="py-1.5 font-mono text-xs">{item.ipAddress}</td>
                        <td className="py-1.5 text-right">
                          <button
                            className="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-red-50"
                            onClick={() => adminDeleteItem(item.id)}
                          >
                            O&apos;chirish
                          </button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-xs text-slate-400">Bo&apos;sh</td></tr>}
                  </tbody>
                </table>
              )}

              {tab === "bans" && (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input
                      value={banIp}
                      onChange={(e) => setBanIp(e.target.value)}
                      placeholder="IP manzil"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                    />
                    <input
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      placeholder="Sabab (ixtiyoriy)"
                      className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500"
                    />
                    <button
                      className="rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                      onClick={() => {
                        if (!banIp.trim()) return;
                        adminBan(banIp.trim(), banReason.trim() || undefined);
                        setBanIp("");
                        setBanReason("");
                        setTimeout(refresh, 300);
                      }}
                    >
                      Bloklash
                    </button>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {bans.map((b) => (
                      <li key={b.ipAddress} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <div>
                          <span className="font-mono">{b.ipAddress}</span>
                          {b.reason && <span className="ml-2 text-xs text-slate-400">{b.reason}</span>}
                        </div>
                        <button
                          className="rounded px-2 py-0.5 text-xs text-blue-500 hover:bg-blue-50"
                          onClick={() => {
                            adminUnban(b.ipAddress);
                            setTimeout(refresh, 300);
                          }}
                        >
                          Ochish
                        </button>
                      </li>
                    ))}
                    {bans.length === 0 && <p className="text-center text-xs text-slate-400">Hech kim bloklanmagan</p>}
                  </ul>
                </div>
              )}

              {tab === "logs" && (
                <ul className="flex flex-col gap-1">
                  {mergedLogs.map((log) => (
                    <li key={log.id} className="flex gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                      <span className="shrink-0 font-mono text-xs text-slate-400">{new Date(log.time).toLocaleTimeString()}</span>
                      <span
                        className={`shrink-0 text-xs font-semibold ${
                          log.level === "ban" ? "text-red-500" : log.level === "delete" ? "text-orange-500" : "text-slate-400"
                        }`}
                      >
                        {log.level}
                      </span>
                      <span className="break-all text-slate-700">{log.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 text-center">
      <div className="text-2xl font-semibold text-slate-800">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  );
}
