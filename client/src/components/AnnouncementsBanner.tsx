"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface PublicAnnouncement {
  id: string;
  title: string;
  message: string;
  createdAt: string;
}

// Shows active SITE announcements above the nav. Dismissible per announcement.
export function AnnouncementsBanner() {
  const [announcements, setAnnouncements] = useState<PublicAnnouncement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    void api<{ announcements: PublicAnnouncement[] }>("/api/announcements")
      .then((d) => setAnnouncements(d.announcements))
      .catch(() => {});
  }, []);

  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  function dismiss(id: string): void {
    setDismissed((s) => new Set(s).add(id));
  }

  return (
    <div className="space-y-2 px-4 pt-3">
      {visible.map((a) => (
        <div
          key={a.id}
          className="mx-auto flex max-w-3xl items-start justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200"
        >
          <div className="min-w-0">
            {a.title && <p className="font-semibold">{a.title}</p>}
            <p className="whitespace-pre-wrap">{a.message}</p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(a.id)}
            className="flex-shrink-0 rounded px-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition dark:text-blue-300 dark:hover:bg-blue-500/20"
            aria-label="Yopish"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
