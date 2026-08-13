"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  Badge,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { SiteSetting } from "@/lib/types";

type Tab = "general" | "seo";

const DEFAULT_GENERAL: Array<{ key: string; label: string }> = [
  { key: "site.name", label: "Sayt nomi" },
  { key: "site.description", label: "Sayt tavsifi" },
  { key: "contact.email", label: "Aloqa email" },
  { key: "contact.phone", label: "Aloqa telefoni" },
  { key: "social.telegram", label: "Telegram havola" },
  { key: "social.instagram", label: "Instagram havola" },
  { key: "social.facebook", label: "Facebook havola" },
  { key: "registration.enabled", label: "Ro'yxatdan o'tish yoqilgan (true/false)" },
];

const DEFAULT_SEO: Array<{ key: string; label: string }> = [
  { key: "seo.home.title", label: "Bosh sahifa sarlavhasi" },
  { key: "seo.home.description", label: "Bosh sahifa tavsifi" },
  { key: "seo.home.keywords", label: "Bosh sahifa kalit so'zlari" },
];

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<SiteSetting[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ settings: SiteSetting[] }>("/api/admin/settings");
      setSettings(data.settings);
      setValues(Object.fromEntries(data.settings.map((s) => [s.key, s.value])));
    } catch {
      setError("Sozlamalarni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const group = tab === "general" ? "general" : "seo";
  const definitions = tab === "general" ? DEFAULT_GENERAL : DEFAULT_SEO;
  const present = new Set(definitions.map((d) => d.key));

  // Merge: server settings win, but unknown keys (saved earlier) are kept too.
  const rows = [
    ...definitions,
    ...settings
      .filter((s) => s.group === group && !present.has(s.key))
      .map((s) => ({ key: s.key, label: s.label || s.key })),
  ];

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = rows.map((r) => ({
        key: r.key,
        value: (values[r.key] ?? "").trim(),
        label: r.label,
        group,
      }));
      await api<{ ok: boolean }>("/api/admin/settings", {
        method: "PUT",
        body: { settings: payload },
      });
      setNotice("Sozlamalar saqlandi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sozlamalar saqlanmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title={tab === "general" ? "Umumiy sozlamalar" : "SEO sozlamalari"}
        subtitle="Sayt nomi, aloqa ma'lumotlari va SEO metateglar."
        actions={
          <div className="flex gap-1.5">
            <TabButton active={tab === "general"} onClick={() => setTab("general")}>
              Umumiy
            </TabButton>
            <TabButton active={tab === "seo"} onClick={() => setTab("seo")}>
              SEO
            </TabButton>
          </div>
        }
      />

      {notice && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      )}
      {error && <ErrorNote text={error} />}

      <AdminCard>
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.key}>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                {row.label}
                <Badge tone="slate">{row.key}</Badge>
              </label>
              <AdminInput
                value={values[row.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [row.key]: e.target.value }))}
                maxLength={4000}
              />
            </div>
          ))}
        </div>
        <div className="mt-5">
          <AdminButton variant="primary" disabled={busy} onClick={() => void save()}>
            Saqlash
          </AdminButton>
        </div>
      </AdminCard>
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
