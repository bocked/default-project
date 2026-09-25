"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminTextarea,
  Badge,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { AdminPolicy, AdminPolicyListResponse, PolicyType, PolicyReviewResponse } from "@/lib/types";

const TYPE_TABS: Array<{ id: PolicyType; label: string }> = [
  { id: "TERMS", label: "Foydalanish shartlari" },
  { id: "PRIVACY", label: "Maxfiylik siyosati" },
  { id: "COOKIES", label: "Cookie qoidalari" },
];

interface EditState {
  id: string;
  content: string;
  changeSummary: string;
  changeReason: string;
}

export default function AdminPoliciesPage() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState<AdminPolicy[]>([]);
  const [activeType, setActiveType] = useState<PolicyType>("TERMS");
  const [editing, setEditing] = useState<EditState | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveReason, setApproveReason] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<AdminPolicyListResponse>("/api/admin/policies");
      setPolicies(data.policies);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Siyosatlarni yuklab bo'lmadi");
    }
  }, []);

  useEffect(() => {
    // Async kick-off: the rule forbids setState synchronously inside an effect.
    window.setTimeout(() => void load(), 0);
  }, [load]);

  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;

  const typePolicies = policies.filter((p) => p.type === activeType);
  const openDraft = typePolicies.find((p) => !p.isApproved);
  const isSuper = user.role === "SUPER_ADMIN";

  function flash(msg: string): void {
    setMessage(msg);
    window.setTimeout(() => setMessage(null), 4000);
  }

  async function createDraft(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ policy: AdminPolicy }>("/api/admin/policies", { method: "POST", body: { type: activeType } });
      await load();
      flash(`Yangi ${TYPE_TABS.find((t) => t.id === activeType)?.label} loyihasi yaratildi.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Loyiha yaratilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft(): Promise<void> {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ policy: AdminPolicy }>(`/api/admin/policies/${editing.id}`, {
        method: "PATCH",
        body: {
          content: editing.content,
          changeSummary: editing.changeSummary,
          changeReason: editing.changeReason,
        },
      });
      setEditing(null);
      await load();
      flash("Loyiha saqlandi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Loyiha saqlanmadi");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDraft(p: AdminPolicy): Promise<void> {
    if (!window.confirm(`"${p.version}" loyihasini o'chirishni tasdiqlaysizmi?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/policies/${p.id}`, { method: "DELETE" });
      await load();
      flash("Loyiha o'chirildi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Loyiha o'chirilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function approveDraft(p: AdminPolicy): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/policies/${p.id}/approve`, {
        method: "POST",
        body: { changeReason: approveReason.trim() || undefined },
      });
      setApprovingId(null);
      setApproveReason("");
      await load();
      flash(`"${p.version}" nashr etildi. Agar TERMS bo'lsa, barcha foydalanuvchilar qayta rozilik so'raladi.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nashr etilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function runReview(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await api<PolicyReviewResponse>("/api/admin/policies/review", {
        method: "POST",
        body: { reason: reviewReason.trim().length > 0 ? reviewReason.trim() : "Qo'lda ko'rib chiqish so'rovi" },
      });
      setReviewOpen(false);
      setReviewReason("");
      await load();
      flash(
        res.created
          ? "Ko'rib chiqish loyihasi yaratildi va SUPER_ADMIN'ga yuborildi."
          : "Mavjud loyiha yangilandi va yana ko'rib chiqishga yuborildi (Telegram + panel)."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ko'rib chiqish so'rovi yuborilmadi");
    } finally {
      setBusy(false);
    }
  }

  const activeLabel = TYPE_TABS.find((t) => t.id === activeType)?.label ?? activeType;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Hujjatlar (siyosat)"
        subtitle="Yuridik hujjatlarni loyiha sifatida tahrirlab, nashr qilasiz. Nashr faqat SUPER_ADMIN uchun."
      />

      <div className="flex flex-wrap gap-1.5">
        {TYPE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveType(t.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              activeType === t.id
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {message && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {message}
        </p>
      )}
      {error && <ErrorNote text={error} />}
      {!isSuper && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          Nashr etish faqat SUPER_ADMIN huquqi. Loyiha yaratish va tahrirlash hamma adminlarga ochiq.
        </p>
      )}

      <AdminCard className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{activeLabel}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {openDraft
              ? "Ochiq loyiha bor — uni tahrirlab, nashrga tayyorlang."
              : "Ochiq loyiha yo'q. Yangi loyiha yaratish joriy matnni asos qilib oladi."}
          </p>
        </div>
        <AdminButton onClick={() => void createDraft()} disabled={busy || Boolean(openDraft)}>
          + Yangi loyiha
        </AdminButton>
      </AdminCard>

      {isSuper && (
        <AdminCard>
          {reviewOpen ? (
            <div className="flex flex-wrap items-center gap-2">
              <AdminInput
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
                maxLength={400}
                placeholder="O'zgarish sababi (masalan: yangi modul aniqlandi, sozlamalar yangilandi)"
                className="max-w-lg flex-1"
              />
              <AdminButton variant="amber" onClick={() => void runReview()} disabled={busy}>
                Ko&apos;rib chiqishga jo&apos;natish
              </AdminButton>
              <AdminButton variant="ghost" onClick={() => setReviewOpen(false)}>
                Bekor qilish
              </AdminButton>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  O&apos;zgarishlarni ko&apos;rib chiqish
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Yangi modul yoki muhim sozlamalar o&apos;zgarganda TERMS loyihasi avtomatik tayyorlanadi.
                </p>
              </div>
              <AdminButton variant="amber" onClick={() => setReviewOpen(true)} disabled={busy}>
                🔍 Ko&apos;rib chiqish so&apos;rovi
              </AdminButton>
            </div>
          )}
        </AdminCard>
      )}

      {typePolicies.length === 0 ? (
        <EmptyState text="Bu tur uchun hujjatlar yo'q." />
      ) : (
        <div className="space-y-3">
          {typePolicies.map((p) => (
            <AdminCard key={p.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">v{p.version}</span>
                  {p.current ? (
                    <Badge tone="emerald">Joriy nashr</Badge>
                  ) : p.isApproved ? (
                    <Badge tone="slate">Nashr qilingan</Badge>
                  ) : (
                    <Badge tone="amber">Loyiha</Badge>
                  )}
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Yangilangan: {new Date(p.updatedAt).toLocaleString("uz-UZ")}
                </span>
              </div>

              {p.changeSummary && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{p.changeSummary}</p>
              )}
              {!p.isApproved && p.changeReason && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Izoh: {p.changeReason}</p>
              )}

              {!p.isApproved && editing?.id === p.id && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      Matn (markdown-lite: ## sarlavha, - ro&apos;yxat)
                    </label>
                    <AdminTextarea
                      value={editing.content}
                      onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                      rows={12}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                        O&apos;zgarish xulosasi
                      </label>
                      <AdminInput
                        value={editing.changeSummary}
                        onChange={(e) => setEditing({ ...editing, changeSummary: e.target.value })}
                        maxLength={300}
                        placeholder="Nima o'zgardi"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                        Nashr izohi
                      </label>
                      <AdminInput
                        value={editing.changeReason}
                        onChange={(e) => setEditing({ ...editing, changeReason: e.target.value })}
                        maxLength={500}
                        placeholder="Nega o'zgartirilyapti (ixtiyoriy)"
                      />
                    </div>
                  </div>
                </div>
              )}

              {approvingId === p.id && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                  <label className="mb-1 block text-xs font-medium text-amber-800 dark:text-amber-300">
                    Nashr izohi (ixtiyoriy)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <AdminInput
                      value={approveReason}
                      onChange={(e) => setApproveReason(e.target.value)}
                      maxLength={500}
                      placeholder="Masalan: X va Y shartlar qo'shildi"
                      className="max-w-md flex-1"
                    />
                    <AdminButton variant="success" onClick={() => void approveDraft(p)} disabled={busy}>
                      Tasdiqlash va nashr
                    </AdminButton>
                    <AdminButton variant="ghost" onClick={() => setApprovingId(null)}>
                      Bekor qilish
                    </AdminButton>
                  </div>
                </div>
              )}

              {!p.isApproved && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {editing?.id === p.id ? (
                    <>
                      <AdminButton onClick={() => void saveDraft()} disabled={busy}>
                        Saqlash
                      </AdminButton>
                      <AdminButton variant="ghost" onClick={() => setEditing(null)}>
                        Bekor qilish
                      </AdminButton>
                    </>
                  ) : (
                    <AdminButton
                      onClick={() =>
                        setEditing({
                          id: p.id,
                          content: p.content,
                          changeSummary: p.changeSummary ?? "",
                          changeReason: p.changeReason ?? "",
                        })
                      }
                    >
                      Tahrirlash
                    </AdminButton>
                  )}
                  {isSuper && editing?.id !== p.id && (
                    <AdminButton variant="success" onClick={() => setApprovingId(p.id)}>
                      Nashr etish
                    </AdminButton>
                  )}
                  {editing?.id !== p.id && (
                    <AdminButton variant="danger" onClick={() => void deleteDraft(p)} disabled={busy}>
                      O&apos;chirish
                    </AdminButton>
                  )}
                </div>
              )}
            </AdminCard>
          ))}
        </div>
      )}
    </div>
  );
}