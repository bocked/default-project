"use client";

import type { QuoteStatus } from "@/lib/types";

const STYLES: Record<QuoteStatus, { label: string; className: string }> = {
  PENDING: { label: "Kutilmoqda", className: "border-amber-200 bg-amber-50 text-amber-700" },
  APPROVED: { label: "Tasdiqlangan", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Rad etilgan", className: "border-rose-200 bg-rose-50 text-rose-700" },
};

export function StatusBadge({ status }: { status: QuoteStatus }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
