"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AdminCard,
  Badge,
  Checkbox,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type {
  AdminFeature,
  AdminPermissionPatchResponse,
  AdminSubAdminRow,
  AdminSubAdminsResponse,
} from "@/lib/types";

const FEATURE_FALLBACK_LABELS: Record<string, string> = {
  canViewUsers: "Foydalanuvchilar ro'yxati",
  canManageUsers: "Foydalanuvchilarni boshqarish",
  canManageQuotes: "Iqtiboslar moderatsiyasi",
  canManageCategories: "Kategoriya va teglar",
  canManageQuizzes: "Testlar moduli",
  canManageAnnouncements: "E'lonlar",
  canManageFeedback: "Fikr-mulohaza",
  canManageSettings: "Sayt sozlamalari",
  canViewAudit: "Audit jurnali",
};

export default function AdminSubAdminsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminSubAdminRow[]>([]);
  const [features, setFeatures] = useState<AdminFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<AdminSubAdminsResponse>("/api/admin/sub-admins");
      setAdmins(data.admins);
      setFeatures(data.features);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ro'yxat yuklanmadi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Async kick-off: the rule forbids setState synchronously inside an effect.
    window.setTimeout(() => void load(), 0);
  }, [load]);

  async function toggle(adminId: string, key: string, value: boolean): Promise<void> {
    const token = `${adminId}:${key}`;
    setBusyKey(token);
    setError(null);
    const prev = admins;
    // Optimistic flip; reverted if the server rejects.
    setAdmins((list) =>
      list.map((a) => (a.id === adminId ? { ...a, permissions: { ...a.permissions, [key]: value } } : a))
    );
    try {
      const res = await api<AdminPermissionPatchResponse>(`/api/admin/sub-admins/${adminId}/permissions`, {
        method: "PATCH",
        body: { permissions: { [key]: value } },
      });
      setAdmins((list) =>
        list.map((a) => (a.id === adminId ? { ...a, permissions: res.admin.permissions } : a))
      );
      setSaved("Ruxsatlar saqlandi.");
      window.setTimeout(() => setSaved(null), 3000);
    } catch (err) {
      setAdmins(prev);
      setError(err instanceof Error ? err.message : "Ruxsat o'zgartirilmadi");
    } finally {
      setBusyKey(null);
    }
  }

  if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN_PASSWORD")) return null;

  const featureLabel = (f: AdminFeature): string => FEATURE_FALLBACK_LABELS[f.key] ?? f.label ?? f.key;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Sub-admin ruxsatlari"
        subtitle="Har bir xodimga modul va bo'limlar bo'yicha yoqish/o'chirish. O'zgarishlar real vaqtda panel va API'ga qo'llanadi."
      />

      {saved && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {saved}
        </p>
      )}
      {error && <ErrorNote text={error} />}

      <AdminCard>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Modullar va ruxsatlar</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Ro&apos;yxatdagi kalitlar har bir admin uchun vaqtincha o&apos;chirilgan/yoqilgan holatdir.
        </p>
        {features.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {features.map((f) => (
              <div
                key={f.key}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{featureLabel(f)}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{f.description}</p>
                  {f.source === "runtime" && <Badge tone="blue">Yangilik (runtime)</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>
      ) : admins.length === 0 ? (
        <EmptyState text="Hozircha sub-adminlar yo'q." />
      ) : (
        <div className="space-y-3">
          {admins.map((admin) => (
            <AdminCard key={admin.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {admin.nickname || admin.name || admin.email}
                  </span>
                  {admin.isSuperAdmin ? (
                    <Badge tone="emerald">Super admin</Badge>
                  ) : (
                    <Badge tone="slate">Sub-admin</Badge>
                  )}
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">{admin.email}</span>
              </div>

              {admin.isSuperAdmin ? (
                <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                  Super admin har doim barcha ruxsatlarga ega — alohida sozlash shart emas.
                </p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {features.map((f) => {
                    const enabled = admin.permissions[f.key] === true;
                    const busy = busyKey === `${admin.id}:${f.key}`;
                    return (
                      <label
                        key={f.key}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                          enabled
                            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                            : "border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/40"
                        } ${busy ? "opacity-60" : ""}`}
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-800 dark:text-slate-200">
                            {featureLabel(f)}
                          </span>
                          <span className="block text-xs text-slate-400 dark:text-slate-500">{f.description}</span>
                        </span>
                        <Checkbox
                          checked={enabled}
                          disabled={busy}
                          onChange={(v) => void toggle(admin.id, f.key, v)}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </AdminCard>
          ))}
        </div>
      )}
    </div>
  );
}