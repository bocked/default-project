"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminButton, Badge, Checkbox } from "@/components/admin-ui";
import { FEATURE_FALLBACK_LABELS } from "@/lib/feature-labels";
import type { AdminFeature, AdminUser } from "@/lib/types";

/**
 * "Admin ruxsatlarini tayinlash" modal. Opened from the Users table instead of
 * immediately promoting: every registered feature is listed as a checkbox
 * (all ON by default), and "Tasdiqlash va Admin qilish" sends the chosen
 * grants to PATCH /api/admin/users/:id/make-admin.
 */
export function AdminPermissionModal({
  user,
  features,
  busy,
  onConfirm,
  onCancel,
}: {
  user: AdminUser;
  features: AdminFeature[];
  busy: boolean;
  onConfirm: (grants: Record<string, boolean>) => void;
  onCancel: () => void;
}) {
  const [grants, setGrants] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(features.map((f) => [f.key, true]))
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const groups = useMemo(() => {
    const map = new Map<string, AdminFeature[]>();
    for (const f of features) {
      const group = f.group || "Boshqa";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(f);
    }
    return [...map.entries()];
  }, [features]);

  const enabledCount = features.filter((f) => grants[f.key] === true).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className={`fixed inset-0 bg-slate-900/60 ${busy ? "" : "cursor-pointer"}`}
        onClick={busy ? undefined : onCancel}
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Admin ruxsatlarini tayinlash</h2>
            <p className="mt-0.5 break-words text-sm text-slate-500 dark:text-slate-400">
              {user.email ?? user.telegramUsername ?? user.telegramId ?? "Foydalanuvchi"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Yopish"
            disabled={busy}
            onClick={onCancel}
            className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="blue">Admin qilinadi</Badge>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Yoqilgan: {enabledCount}/{features.length}
          </span>
        </div>

        {features.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">Ruxsatlar ro&apos;yxati yuklanmoqda...</p>
        ) : (
          <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
            {groups.map(([group, list]) => (
              <div key={group}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {group}
                </p>
                <div className="mt-1 space-y-1">
                  {list.map((f) => {
                    const label = FEATURE_FALLBACK_LABELS[f.key] ?? f.label ?? f.key;
                    return (
                      <label
                        key={f.key}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-800 dark:text-slate-200">{label}</span>
                          <span className="block text-xs text-slate-400 dark:text-slate-500">{f.description}</span>
                        </span>
                        <Checkbox
                          checked={grants[f.key] === true}
                          disabled={busy}
                          onChange={(v) => setGrants((prev) => ({ ...prev, [f.key]: v }))}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <AdminButton variant="slate" disabled={busy} onClick={onCancel}>
            Bekor qilish
          </AdminButton>
          <AdminButton
            variant="success"
            disabled={busy || features.length === 0 || enabledCount === 0}
            onClick={() => onConfirm(grants)}
          >
            {busy ? "Saqlanmoqda..." : "Tasdiqlash va Admin qilish"}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}