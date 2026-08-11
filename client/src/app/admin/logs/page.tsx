"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AdminCard, Badge, EmptyState, ErrorNote, PageTitle } from "@/components/admin-ui";
import type { AdminLogEntry, AuditLogEntry } from "@/lib/types";

const levelTone: Record<AdminLogEntry["level"], "slate" | "amber" | "rose"> = {
  info: "slate",
  warn: "amber",
  ban: "rose",
  delete: "rose",
};

const actionLabel: Record<string, string> = {
  "quote.approve": "Iqtibos tasdiqlandi",
  "quote.reject": "Iqtibos rad etildi",
  "quote.edit": "Iqtibos tahrirlandi",
  "quote.delete": "Iqtibos arxivga",
  "quote.restore": "Iqtibos tiklandi",
  "quote.approve.bulk": "Iqtiboslar tasdiqlandi (ommaviy)",
  "quote.reject.bulk": "Iqtiboslar rad etildi (ommaviy)",
  "quote.delete.bulk": "Iqtiboslar arxivga (ommaviy)",
  "quote.restore.bulk": "Iqtiboslar tiklandi (ommaviy)",
  "user.block": "Foydalanuvchi bloklandi",
  "user.unblock": "Foydalanuvchi blokdan chiqarildi",
  "user.delete": "Foydalanuvchi arxivga",
  "user.restore": "Foydalanuvchi tiklandi",
  "user.block.bulk": "Foydalanuvchilar bloklandi (ommaviy)",
  "user.unblock.bulk": "Foydalanuvchilar blokdan chiqarildi (ommaviy)",
  "user.delete.bulk": "Foydalanuvchilar arxivga (ommaviy)",
  "user.restore.bulk": "Foydalanuvchilar tiklandi (ommaviy)",
  "tag.edit": "Heshteg tahrirlandi",
  "tag.delete": "Heshteg o'chirildi",
  "content.update": "Kontent yangilandi",
};

export default function AdminLogsPage() {
  const [live, setLive] = useState<AdminLogEntry[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ logs: AdminLogEntry[] }>("/api/admin/logs")
      .then((d) => setLive(d.logs))
      .catch(() => setError("Loglarni yuklab bo'lmadi"));
    void api<{ logs: AuditLogEntry[] }>("/api/admin/audit-logs")
      .then((d) => setAudit(d.logs))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <PageTitle title="Loglar" subtitle="Admin amallari auditi va jonli hodisalar." />
      {error && <ErrorNote text={error} />}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
          Audit (barcha muhim admin amallari)
        </h2>
        {audit.length === 0 && <EmptyState text="Audit yozuvlari yo'q." />}
        <AdminCard className="overflow-x-auto p-0">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-4 py-3">Vaqt</th>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Amal</th>
                <th className="px-4 py-3">Tafsilot</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {new Date(log.createdAt).toLocaleString("uz-UZ")}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                    {log.adminEmail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <Badge tone="slate">{actionLabel[log.action] ?? log.action}</Badge>
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {log.detail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">{log.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminCard>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
          Jonli hodisalar (xotira)
        </h2>
        {live.length === 0 && <EmptyState text="Jonli hodisalar yo'q." />}
        <AdminCard>
          <div className="space-y-2">
            {live.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500">
                  {new Date(log.time).toLocaleString("uz-UZ")}
                </span>
                <Badge tone={levelTone[log.level]}>{log.level}</Badge>
                <span className="text-slate-600 dark:text-slate-300">{log.message}</span>
              </div>
            ))}
          </div>
        </AdminCard>
      </section>
    </div>
  );
}
