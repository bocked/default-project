"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  Badge,
  Checkbox,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type {
  TelegramSettings,
  TelegramSettingsResponse,
  TelegramStatusResponse,
} from "@/lib/types";

const TOGGLE_ITEMS: Array<{
  key: "notifyPolicy" | "notifyNewFeature" | "notifyHealth" | "notifyBackup";
  label: string;
  description: string;
}> = [
  { key: "notifyPolicy", label: "Siyosat tasdiqlash", description: "TERMS/PRIVACY/COOKIES loyihalari tasdiqlashga chiqqanda Telegram'ga yuboriladi." },
  { key: "notifyNewFeature", label: "Yangi funksiya ogohlantirishi", description: "Runtime'da yangi modul aniqlanganda admin chatiga xabar boradi." },
  { key: "notifyHealth", label: "Server 500 / PM2 / Disk ogohlantirishi", description: "Server xatosi, o'chib qolish yoki disk 80%+ bo'lganda ogohlantirish." },
  { key: "notifyBackup", label: "Zaxira nusxa bildirishnomasi", description: "Har kungi to'liq backup bilan bog'liq xabar (faqat Telegram, kanalga yuklash doim uriniladi)." },
];

function statusBadge(status: string): { tone: "emerald" | "rose" | "amber" | "slate"; label: string } {
  switch (status) {
    case "ok":
      return { tone: "emerald", label: "Ulangan ✓" };
    case "error":
      return { tone: "rose", label: "Xatolik ✗" };
    case "disabled":
      return { tone: "slate", label: "O'chirilgan" };
    default:
      return { tone: "amber", label: status };
  }
}

export default function AdminTelegramPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null);
  const [botToken, setBotToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const data = await api<TelegramSettingsResponse>("/api/admin/telegram/settings");
      setSettings(data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sozlamalar yuklanmadi");
    }
  }, []);

  const loadStatus = useCallback(async (refresh = false) => {
    try {
      const data = await api<TelegramStatusResponse>(`/api/admin/telegram/status${refresh ? "?refresh=1" : ""}`);
      setStatus(data);
    } catch {
      /* status card is non-critical */
    }
  }, []);

  useEffect(() => {
    // Async kick-off: the rule forbids setState synchronously inside an effect.
    window.setTimeout(() => {
      void (async () => {
        await Promise.all([loadSettings(), loadStatus()]);
        setLoading(false);
      })();
    }, 0);
  }, [loadSettings, loadStatus]);

  if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN_PASSWORD")) return null;

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const body: Record<string, unknown> = {
        superAdminChatId: settings?.superAdminChatId ?? "",
        channelValue: settings?.channelValue ?? "",
        notifyPolicy: settings?.notifyPolicy ?? true,
        notifyNewFeature: settings?.notifyNewFeature ?? true,
        notifyHealth: settings?.notifyHealth ?? true,
        notifyBackup: settings?.notifyBackup ?? true,
      };
      if (botToken.trim()) body.botToken = botToken.trim();
      await api<TelegramSettingsResponse>("/api/admin/telegram/settings", { method: "PUT", body });
      await Promise.all([loadSettings(), loadStatus(true)]);
      setBotToken("");
      setInfo("Sozlamalar saqlandi." + (body.botToken ? " Bot qayta ulandi." : ""));
      window.setTimeout(() => setInfo(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sozlamalar saqlanmadi");
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await loadStatus(true);
      setInfo("Bot holati yangilandi.");
      window.setTimeout(() => setInfo(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Holat olinmadi");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(): Promise<void> {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await api<{ ok: boolean }>("/api/admin/telegram/test", { method: "POST", body: {} });
      setInfo("Sinov xabari super admin chatiga yuborildi.");
      await loadStatus(true);
      window.setTimeout(() => setInfo(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sinov xabar yuborilmadi");
    } finally {
      setBusy(false);
    }
  }

  const setField = <K extends keyof TelegramSettings>(key: K, value: TelegramSettings[K]): void => {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  };

  if (loading || !settings) {
    return <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>;
  }

  const badge = statusBadge(status?.botStatus ?? settings.botStatus);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Telegram Sozlamalari"
        subtitle="Bot, super admin chat va turli ogohlantirishlarni bitta sahifadan boshqaring. O'zgarishlar darhol qo'llanadi."
      />

      {info && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {info}
        </p>
      )}
      {error && <ErrorNote text={error} />}

      <AdminCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Bot holati</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Yangi token kiritilsa, bot darhol qayta ulanadi (webhook + getMe tekshiruvi).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={badge.tone}>{badge.label}</Badge>
            <AdminButton variant="slate" disabled={busy} onClick={() => void refreshStatus()}>
              Holatni tekshirish
            </AdminButton>
            <AdminButton disabled={busy || !status?.configured} onClick={() => void sendTest()}>
              Sinov xabar yuborish
            </AdminButton>
          </div>
        </div>

        {status && (
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
              <p className="text-xs text-slate-400 dark:text-slate-500">Bot username</p>
              <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
                {status.botUsername ? `@${status.botUsername}` : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
              <p className="text-xs text-slate-400 dark:text-slate-500">Oxirgi tekshiruv</p>
              <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
                {status.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleString() : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 px-3 py-2 dark:border-slate-800">
              <p className="text-xs text-slate-400 dark:text-slate-500">Kanal (yuklash manzili)</p>
              <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
                {status.channelResolved ? <code>{status.channelResolved}</code> : "Hali aniqlanmagan"}
              </p>
            </div>
            {status.lastError && (
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 dark:border-rose-800/40 dark:bg-rose-950/30 sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-rose-500 dark:text-rose-400">{"So'nggi xato"}</p>
                <p className="mt-0.5 font-medium text-rose-700 dark:text-rose-300">{status.lastError}</p>
              </div>
            )}
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Asosiy sozlamalar</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Bot token
              {settings.botTokenSet && (
                <span className="ml-2 font-normal text-slate-400 dark:text-slate-500">
                  joriy: {settings.botTokenMasked}
                </span>
              )}
            </label>
            <AdminInput
              type="password"
              autoComplete="off"
              placeholder={settings.botTokenSet ? "Yangi token kiriting (bo'sh = eski saqlanadi)" : "BotFather'dan olingan token"}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Super admin chat ID
            </label>
            <AdminInput
              type="text"
              inputMode="numeric"
              placeholder="Masalan: 899933314"
              value={settings.superAdminChatId}
              onChange={(e) => setField("superAdminChatId", e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Kanal (qabul qiluvchi)
          </label>
          <AdminInput
            type="text"
            placeholder="@kanal, -1001234567890 yoki t.me havolasi"
            value={settings.channelValue}
            onChange={(e) => setField("channelValue", e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Xususiy kanal (t.me/+...) bo&apos;lsa, botni kanalga admin qo&apos;shing yoki kanaldagi istalgan xabarni botga
            forward qiling — kanal ID&apos;si avtomatik aniqlanadi.
          </p>
        </div>

        <h2 className="mt-6 text-sm font-semibold text-slate-800 dark:text-slate-200">Bildirishnomalar</h2>
        <div className="mt-3 grid gap-2">
          {TOGGLE_ITEMS.map((item) => (
            <label
              key={item.key}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${
                settings[item.key]
                  ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30"
                  : "border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/40"
              }`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">{item.label}</span>
                <span className="block text-xs text-slate-400 dark:text-slate-500">{item.description}</span>
              </span>
              <Checkbox checked={settings[item.key]} onChange={(v) => setField(item.key, v)} />
            </label>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <AdminButton disabled={busy} onClick={() => void save()}>
            Saqlash
          </AdminButton>
        </div>
      </AdminCard>
    </div>
  );
}