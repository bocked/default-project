"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  Badge,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { AdminQuiz, AdminQuizListResponse, QuizStatus } from "@/lib/types";

const OPTION_LETTERS = "ABCDEFGH".split("");

const STATUS_TABS: Array<{ id: QuizStatus | "ALL"; label: string }> = [
  { id: "ALL", label: "Barchasi" },
  { id: "PENDING", label: "Kutilmoqda" },
  { id: "APPROVED", label: "Tasdiqlangan" },
  { id: "REJECTED", label: "Rad etilgan" },
];

export default function AdminQuizzesPage() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<AdminQuiz[]>([]);
  const [filter, setFilter] = useState<QuizStatus | "ALL">("PENDING");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: QuizStatus | "ALL") => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (f !== "ALL") params.set("status", f);
      const data = await api<AdminQuizListResponse>(`/api/admin/quizzes?${params.toString()}`);
      setQuizzes(data.quizzes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Testlarni yuklab bo'lmadi");
    }
  }, []);

  useEffect(() => {
    // Debounced kick-off keeps setState out of the effect body (lint rule).
    const id = window.setTimeout(() => void load(filter), 120);
    return () => window.clearTimeout(id);
  }, [load, filter]);

  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) return null;
  const isSuper = user.role === "SUPER_ADMIN";

  async function approve(q: AdminQuiz): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/quizzes/${q.id}/approve`, { method: "POST" });
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test tasdiqlanmadi");
    } finally {
      setBusy(false);
    }
  }

  async function reject(q: AdminQuiz): Promise<void> {
    if (!rejectReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/quizzes/${q.id}/reject`, {
        method: "POST",
        body: { reason: rejectReason.trim() },
      });
      setRejectingId(null);
      setRejectReason("");
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test rad etilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function remove(q: AdminQuiz): Promise<void> {
    if (!window.confirm(`"${q.title}" testini o'chirishni tasdiqlaysizmi?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/quizzes/${q.id}`, { method: "DELETE" });
      await load(filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test o'chirilmadi");
    } finally {
      setBusy(false);
    }
  }

  const statusBadge = (status: QuizStatus): React.ReactNode =>
    status === "PENDING" ? (
      <Badge tone="amber">Kutilmoqda</Badge>
    ) : status === "APPROVED" ? (
      <Badge tone="emerald">Tasdiqlangan</Badge>
    ) : (
      <Badge tone="rose">Rad etilgan</Badge>
    );

  return (
    <div className="space-y-4">
      <PageTitle
        title="Testlar moderatsiyasi"
        subtitle="Testlarni tasdiqlash, rad etish yoki o'chirish."
      />

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              filter === t.id
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <ErrorNote text={error} />}

      {quizzes.length === 0 ? (
        <EmptyState text="Bu filtrda testlar yo'q." />
      ) : (
        <div className="space-y-3">
          {quizzes.map((q) => (
            <AdminCard key={q.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{q.title}</h3>
                    {statusBadge(q.status)}
                  </div>
                  {q.description && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{q.description}</p>}
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {q.author.nickname ?? q.author.email ?? "Noma'lum"} · {q.questionCount} savol · {q.resultCount}{" "}
                    urinish · {new Date(q.createdAt).toLocaleString("uz-UZ")}
                  </p>
                  {q.rejectionReason && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">Rad sababi: {q.rejectionReason}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <AdminButton variant="slate" onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}>
                    {expandedId === q.id ? "Yopish" : "Ko'rish"}
                  </AdminButton>
                  {q.status === "PENDING" && (
                    <AdminButton variant="success" onClick={() => void approve(q)} disabled={busy}>
                      Tasdiqlash
                    </AdminButton>
                  )}
                  {q.status !== "REJECTED" && (
                    <AdminButton
                      variant={rejectingId === q.id ? "ghost" : "danger"}
                      onClick={() => {
                        setRejectingId(rejectingId === q.id ? null : q.id);
                        setRejectReason("");
                      }}
                    >
                      Rad etish
                    </AdminButton>
                  )}
                  {isSuper && (
                    <AdminButton variant="danger" onClick={() => void remove(q)} disabled={busy}>
                      O&apos;chirish
                    </AdminButton>
                  )}
                </div>
              </div>

              {rejectingId === q.id && (
                <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 dark:border-rose-700 dark:bg-rose-950/30">
                  <label className="mb-1 block text-xs font-medium text-rose-800 dark:text-rose-300">
                    Rad etish sababi *
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <AdminInput
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      maxLength={500}
                      placeholder="Muallifga ko'rinadigan sabab"
                      className="max-w-md flex-1"
                    />
                    <AdminButton variant="danger" onClick={() => void reject(q)} disabled={busy || !rejectReason.trim()}>
                      Rad etish
                    </AdminButton>
                    <AdminButton variant="ghost" onClick={() => setRejectingId(null)}>
                      Bekor qilish
                    </AdminButton>
                  </div>
                </div>
              )}

              {expandedId === q.id && q.questions && (
                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {q.questions.map((question, qi) => (
                    <div key={question.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {qi + 1}. {question.question}
                      </p>
                      <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                        {question.options.map((option, oi) => (
                          <li key={oi}>
                            {OPTION_LETTERS[oi] ?? oi + 1}. {option}
                            {question.correctIndex === oi && (
                              <span className="ml-2 font-semibold text-emerald-600 dark:text-emerald-400">✓ to&apos;g&apos;ri</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
          ))}
        </div>
      )}
    </div>
  );
}