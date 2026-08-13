"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  AdminButton,
  AdminCard,
  AdminSelect,
  AdminTextarea,
  Badge,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { AdminFeedback } from "@/lib/types";

const CATEGORIES: Record<string, { label: string; tone: "rose" | "blue" | "amber" | "slate" }> = {
  COMPLAINT: { label: "Shikoyat", tone: "rose" },
  SUGGESTION: { label: "Taklif", tone: "blue" },
  REPORT: { label: "Hisobot", tone: "amber" },
  OTHER: { label: "Boshqa", tone: "slate" },
};

const STATUS: Record<string, { label: string; tone: "amber" | "blue" | "emerald" }> = {
  OPEN: { label: "Ochiq", tone: "amber" },
  IN_PROGRESS: { label: "Jarayonda", tone: "blue" },
  RESOLVED: { label: "Yechilgan", tone: "emerald" },
};

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<AdminFeedback[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [replyStatus, setReplyStatus] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const data = await api<{ feedback: AdminFeedback[] }>(`/api/admin/feedback?${params.toString()}`);
      setFeedback(data.feedback);
    } catch {
      setError("Shikoyatlarni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function reply(item: AdminFeedback): Promise<void> {
    const text = (replies[item.id] ?? "").trim();
    const status = replyStatus[item.id] ?? "RESOLVED";
    if (!text) {
      window.alert("Javob matnini kiriting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<{ feedback: AdminFeedback }>(`/api/admin/feedback/${item.id}`, {
        method: "PATCH",
        body: { status, adminReply: text },
      });
      setReplies((r) => ({ ...r, [item.id]: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Javob saqlanmadi");
    } finally {
      setBusy(false);
    }
  }

  async function setStatusOnly(item: AdminFeedback, status: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ feedback: AdminFeedback }>(`/api/admin/feedback/${item.id}`, {
        method: "PATCH",
        body: { status },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Holat o'zgartirilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: AdminFeedback): Promise<void> {
    if (!window.confirm("Bu shikoyatni o'chirishni tasdiqlaysizmi?")) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/feedback/${item.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shikoyat o'chirilmadi");
    } finally {
      setBusy(false);
    }
  }

  const open = feedback.filter((f) => f.status !== "RESOLVED").length;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Shikoyatlar va takliflar"
        subtitle={`Foydalanuvchilardan kelgan murojaatlar (${open} ta yechilmagan).`}
        actions={
          <AdminSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[180px]">
            <option value="">Barcha holatlar</option>
            <option value="OPEN">Ochiq</option>
            <option value="IN_PROGRESS">Jarayonda</option>
            <option value="RESOLVED">Yechilgan</option>
          </AdminSelect>
        }
      />

      {error && <ErrorNote text={error} />}
      {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}
      {!busy && feedback.length === 0 && <EmptyState text="Shikoyatlar yo'q." />}

      <div className="space-y-3">
        {feedback.map((item) => {
          const cat = CATEGORIES[item.category] ?? CATEGORIES.OTHER;
          const st = STATUS[item.status] ?? STATUS.OPEN;
          return (
            <AdminCard key={item.id}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={cat.tone}>{cat.label}</Badge>
                <Badge tone={st.tone}>{st.label}</Badge>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {item.user ? item.user.nickname || item.user.name || item.user.email : "Foydalanuvchi o'chirilgan"}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {new Date(item.createdAt).toLocaleString("uz-UZ")}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{item.text}</p>

              {item.adminReply && (
                <div className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <p className="font-medium">Admin javobi:</p>
                  <p className="mt-0.5">{item.adminReply}</p>
                </div>
              )}

              {item.status !== "RESOLVED" && (
                <div className="mt-3 space-y-2 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                  <AdminTextarea
                    placeholder="Javob matni..."
                    rows={2}
                    value={replies[item.id] ?? ""}
                    onChange={(e) => setReplies((r) => ({ ...r, [item.id]: e.target.value }))}
                    maxLength={2000}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminSelect
                      value={replyStatus[item.id] ?? "RESOLVED"}
                      onChange={(e) => setReplyStatus((r) => ({ ...r, [item.id]: e.target.value }))}
                      className="max-w-[160px]"
                    >
                      <option value="OPEN">Ochiq</option>
                      <option value="IN_PROGRESS">Jarayonda</option>
                      <option value="RESOLVED">Yechilgan</option>
                    </AdminSelect>
                    <AdminButton variant="success" disabled={busy} onClick={() => void reply(item)}>
                      Javob yuborish
                    </AdminButton>
                    <AdminButton
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void setStatusOnly(item, item.status === "OPEN" ? "IN_PROGRESS" : "OPEN")}
                    >
                      {item.status === "OPEN" ? "Jarayonga o'tkazish" : "Qayta ochish"}
                    </AdminButton>
                    <AdminButton variant="ghost" disabled={busy} onClick={() => void remove(item)}>
                      O&apos;chirish
                    </AdminButton>
                  </div>
                </div>
              )}
            </AdminCard>
          );
        })}
      </div>
    </div>
  );
}
