"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminSelect,
  Badge,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type {
  ActiveOtp,
  EmailDeliveryStatus,
  EmailLogEntry,
  EmailLogResponse,
  EmailTemplate,
  EmailTestResult,
  EmailType,
  EmailsHealth,
} from "@/lib/types";

type TabId = "smtp" | "logs" | "otp";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "smtp", label: "SMTP holati" },
  { id: "logs", label: "Pochta jurnali" },
  { id: "otp", label: "OTP nazorati" },
];

const TYPE_LABELS: Record<EmailType, string> = {
  VERIFICATION: "Tasdiqlash",
  PASSWORD_RESET: "Parolni tiklash",
  QUOTE_MODERATION: "Moderatsiya",
  ANNOUNCEMENT: "Xabar",
  TEST: "Sinov",
};

export default function EmailManagementPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>("smtp");

  if (!user) return null;
  if (user.role !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto mt-8 w-full max-w-sm">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-500/30 dark:bg-rose-950/30">
          <h1 className="text-lg font-semibold text-rose-800 dark:text-rose-300">Ruxsat yo&apos;q</h1>
          <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">
            Pochta boshqaruvi faqat super admin uchun mavjud.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Pochta Boshqaruvi"
        subtitle="SMTP holati, email tarixi va faol OTP kodlarini nazorat qilish."
      />
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              tab === t.id
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "smtp" && <SmtpTab />}
      {tab === "logs" && <LogsTab />}
      {tab === "otp" && <OtpTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SMTP holati + Test + shablon preview
// ---------------------------------------------------------------------------

function SmtpTab() {
  const { user } = useAuth();
  const [health, setHealth] = useState<EmailsHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState<string>(user?.email ?? "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<EmailTestResult | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [preview, setPreview] = useState<EmailTemplate | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<EmailsHealth>("/api/admin/emails/health")
      .then((h) => {
        if (!cancelled) setHealth(h);
      })
      .catch(() => {
        if (!cancelled) setError("SMTP holatini olishda xatolik yuz berdi.");
      });
    void api<{ templates: EmailTemplate[] }>("/api/admin/emails/templates")
      .then((r) => {
        if (!cancelled) setTemplates(r.templates);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const onTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api<EmailTestResult>("/api/admin/emails/test", {
        method: "POST",
        body: { to: testTo.trim() || undefined },
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        to: testTo,
        messageId: null,
        error: err instanceof Error ? err.message : "Noma&apos;lum xatolik",
      });
    } finally {
      setTesting(false);
    }
  }, [testTo]);

  const modeBadge =
    health?.mode === "smtp" ? (
      <Badge tone="emerald">SMTP</Badge>
    ) : health?.mode === "brevo" ? (
      <Badge tone="blue">Brevo API</Badge>
    ) : (
      <Badge tone="slate">O&apos;chirilgan</Badge>
    );

  return (
    <div className="space-y-4">
      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">SMTP ulanish holati</h2>
          {modeBadge}
        </div>
        {error && (
          <p className="mt-3">
            <ErrorNote text={error} />
          </p>
        )}
        {health && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <HealthRow label="Xost" value={health.host ?? "(sozlanmagan)"} />
            <HealthRow label="Port" value={String(health.port)} />
            <HealthRow label="Shifrlash" value={health.secure ? "TLS/SSL" : "Yo&apos;q"} />
            <HealthRow label="Jo&apos;natuvchi" value={health.from || "(—)"} />
            <HealthRow label="Rejim" value={health.testMode ? "Sinov rejimi (hech narsa yuborilmaydi)" : "Jonli jo&apos;natish"} />
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Sinov xati yuborish</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Belgilangan manzilga real SMTP orqali sinov xati jo&apos;natiladi. Bo&apos;sh qoldirilsa, sizning
          emailingizga boradi.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <AdminInput
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="qabul-qiluvchi@example.com"
            className="max-w-xs"
          />
          <AdminButton variant="primary" onClick={() => void onTest()} disabled={testing}>
            {testing ? "Yuborilmoqda..." : "Yuborish"}
          </AdminButton>
        </div>
        {testResult && (
          <p className={`mt-3 text-sm ${testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {testResult.ok
              ? `Sinov xati yuborildi → ${testResult.to}${testResult.messageId ? " (messageId: " + testResult.messageId + ")" : ""}`
              : `Yuborilmadi: ${testResult.error ?? "Noma'lum xatolik"}`}
          </p>
        )}
      </AdminCard>

      <AdminCard>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Email shablonlari</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Foydalanuvchilarga yuboriladigan HTML shablonlar namuna ma&apos;lumotlar bilan.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {templates.map((t) => (
            <AdminButton key={t.id} variant="slate" onClick={() => setPreview(t)}>
              Ko&apos;rish: {t.label}
            </AdminButton>
          ))}
        </div>
        {templates.length === 0 && <p className="mt-3"><EmptyState text="Shablonlar topilmadi." /></p>}
      </AdminCard>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{preview.label}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">Mavzu: {preview.subject}</p>
              </div>
              <AdminButton variant="slate" onClick={() => setPreview(null)}>
                Yopish
              </AdminButton>
            </div>
            <iframe
              title={`${preview.label} preview`}
              srcDoc={preview.html}
              sandbox=""
              className="h-[460px] w-full bg-white"
            />
            <details className="border-t border-slate-200 dark:border-slate-700">
              <summary className="cursor-pointer px-5 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                Matnli (text) versiya
              </summary>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all px-5 pb-4 text-xs text-slate-600 dark:text-slate-300">
                {preview.text}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 break-all text-sm text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pochta jurnali
// ---------------------------------------------------------------------------

function LogsTab() {
  const [type, setType] = useState<EmailType | "">("");
  const [status, setStatus] = useState<EmailDeliveryStatus | "">("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EmailLogResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page), limit: "20" });
    if (type) qs.set("type", type);
    if (status) qs.set("status", status);
    void api<EmailLogResponse>(`/api/admin/emails/logs?${qs.toString()}`)
      .then(setData)
      .catch(() => setFailed(true));
  }, [type, status, page]);

  const changeType = useCallback((v: string) => {
    setType(v as EmailType | "");
    setPage(1);
  }, []);
  const changeStatus = useCallback((v: string) => {
    setStatus(v as EmailDeliveryStatus | "");
    setPage(1);
  }, []);

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <AdminCard className="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4 dark:border-slate-700">
        <AdminSelect value={type} onChange={(e) => changeType(e.target.value)} className="w-auto">
          <option value="">Barcha turlar</option>
          {(Object.keys(TYPE_LABELS) as EmailType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </AdminSelect>
        <AdminSelect value={status} onChange={(e) => changeStatus(e.target.value)} className="w-auto">
          <option value="">Barcha holatlar</option>
          <option value="SUCCESS">Muvaffaqiyatli</option>
          <option value="FAILED">Xato</option>
        </AdminSelect>
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">Jami: {data?.total ?? 0}</span>
      </div>

      {failed && (
        <div className="p-4">
          <ErrorNote text="Jurnalni yuklashda xatolik yuz berdi." />
        </div>
      )}

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {!data && <div className="p-4 text-sm text-slate-500 dark:text-slate-400">Yuklanmoqda...</div>}
        {data && data.logs.length === 0 && (
          <div className="p-4">
            <EmptyState text="Hech qanday xat yuborilmagan." />
          </div>
        )}
        {data?.logs.map((log) => (
          <LogRow key={log.id} log={log} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4 dark:border-slate-700">
        <AdminButton variant="slate" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          ← Oldingi
        </AdminButton>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {page} / {pageCount}
        </span>
        <AdminButton variant="slate" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
          Keyingi →
        </AdminButton>
      </div>
    </AdminCard>
  );
}

function LogRow({ log }: { log: EmailLogEntry }) {
  return (
    <div className="flex flex-wrap items-start gap-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{log.subject}</p>
        <p className="mt-0.5 break-all text-xs text-slate-500 dark:text-slate-400">
          {log.to} · {new Date(log.createdAt).toLocaleString("uz-UZ")}
        </p>
        {log.error && <p className="mt-1 break-all text-xs text-rose-500">{log.error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Badge tone={log.type === "TEST" ? "slate" : "blue"}>{TYPE_LABELS[log.type]}</Badge>
        <Badge tone={log.status === "SUCCESS" ? "emerald" : "rose"}>
          {log.status === "SUCCESS" ? "Yuborildi" : "Xato"}
        </Badge>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OTP nazorati
// ---------------------------------------------------------------------------

function OtpTab() {
  const [otps, setOtps] = useState<ActiveOtp[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tick source for the countdown; Date.now() must live in the interval
  // callback (impure calls are not allowed inside the render body).
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const load = useCallback(() => {
    void api<{ otps: ActiveOtp[] }>("/api/admin/emails/otp")
      .then((r) => setOtps(r.otps))
      .catch(() => setError("OTP ro&apos;yxatini yuklashda xatolik yuz berdi."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (userId: string, action: "resend" | "revoke") => {
      setBusyId(userId);
      setError(null);
      try {
        await api<{ ok: boolean }>(`/api/admin/emails/otp/${userId}/${action}`, { method: "POST" });
        load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Amal bajarilmadi");
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  return (
    <AdminCard className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Faol email tasdiqlash kodlari</h2>
        <span className="text-xs text-slate-500 dark:text-slate-400">Jami: {otps.length}</span>
      </div>
      {error && (
        <div className="p-4">
          <ErrorNote text={error} />
        </div>
      )}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {otps.length === 0 && (
          <div className="p-4">
            <EmptyState text="Hozirda faol OTP kodlar yo'q." />
          </div>
        )}
        {otps.map((o) => {
          const secondsLeft = Math.max(0, Math.floor((new Date(o.expiresAt).getTime() - now) / 1000));
          const minutes = Math.floor(secondsLeft / 60);
          const seconds = secondsLeft % 60;
          return (
            <div key={o.userId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{o.email}</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Kod: <span className="font-mono tracking-widest">{o.masked}</span> · muddat: {minutes}:{String(seconds).padStart(2, "0")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <AdminButton
                  variant="success"
                  disabled={busyId === o.userId}
                  onClick={() => void act(o.userId, "resend")}
                >
                  Qayta yuborish
                </AdminButton>
                <AdminButton
                  variant="danger"
                  disabled={busyId === o.userId}
                  onClick={() => void act(o.userId, "revoke")}
                >
                  Bekor qilish
                </AdminButton>
              </div>
            </div>
          );
        })}
      </div>
    </AdminCard>
  );
}