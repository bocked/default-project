"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AdminCard, Badge, EmptyState, ErrorNote, PageTitle } from "@/components/admin-ui";
import type { AdminLogEntry } from "@/lib/types";

const levelTone: Record<AdminLogEntry["level"], "slate" | "amber" | "rose"> = {
  info: "slate",
  warn: "amber",
  ban: "rose",
  delete: "rose",
};

export function AdminLiveLogsTab() {
  const [live, setLive] = useState<AdminLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ logs: AdminLogEntry[] }>("/api/admin/logs")
      .then((d) => setLive(d.logs))
      .catch(() => setError("Loglarni yuklab bo'lmadi"));
  }, []);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Jonli loglar"
        subtitle="Xotiradagi yangi hodisalar (ban, o'chirish, ogohlantirish va info)."
      />
      {error && <ErrorNote text={error} />}

      {live.length === 0 && <EmptyState text="Jonli hodisalar yo'q." />}
      {live.length > 0 && (
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
      )}
    </div>
  );
}