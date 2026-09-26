"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AdminCard, Badge, EmptyState, ErrorNote, PageTitle } from "@/components/admin-ui";
import type { AuditLogEntry } from "@/lib/types";

const actionLabel: Record<string, string> = {
  "quote.approve": "Iqtibos tasdiqlandi",
  "quote.reject": "Iqtibos rad etildi",
  "quote.edit": "Iqtibos tahrirlandi",
  "quote.delete": "Iqtibos arxivga",
  "quote.delete.hard": "Iqtibos butunlay o'chirildi",
  "quote.restore": "Iqtibos tiklandi",
  "quote.post-telegram": "Telegram kanaliga joylandi",
  "quote.approve.bulk": "Iqtiboslar tasdiqlandi (ommaviy)",
  "quote.reject.bulk": "Iqtiboslar rad etildi (ommaviy)",
  "quote.delete.bulk": "Iqtiboslar arxivga (ommaviy)",
  "quote.restore.bulk": "Iqtiboslar tiklandi (ommaviy)",
  "user.block": "Foydalanuvchi bloklandi",
  "user.unblock": "Foydalanuvchi blokdan chiqarildi",
  "user.delete": "Foydalanuvchi arxivga",
  "user.restore": "Foydalanuvchi tiklandi",
  "user.block.bulk": "Foydalanuvchilar bloklandi (ommaviy)",
  "user.unblock.bulk": "Foydalanuvchilar blokdan chiqarildi (ommaviy)",
  "user.delete.bulk": "Foydalanuvchilar arxivga (ommaviy)",
  "user.restore.bulk": "Foydalanuvchilar tiklandi (ommaviy)",
  "user.super-approve": "Foydalanuvchi tasdiqlandi",
  "user.super-unapprove": "Tasdiqlash bekor qilindi",
  "user.super-reject": "Foydalanuvchi rad etildi",
  "user.premium": "VIP holati o'zgartirildi",
  "user.role": "Foydalanuvchi roli o'zgartirildi",
  "user.make-admin": "Administrator etib tayinlandi",
  "admin.permissions": "Admin ruxsatlari o'zgartirildi",
  "tag.edit": "Heshteg tahrirlandi",
  "tag.delete": "Heshteg o'chirildi",
  "category.create": "Bo'lim yaratildi",
  "category.edit": "Bo'lim tahrirlandi",
  "category.delete": "Bo'lim o'chirildi",
  "content.update": "Kontent yangilandi",
  "policy.create-draft": "Siyosat loyihasi yaratildi",
  "policy.edit-draft": "Siyosat loyihasi tahrirlandi",
  "policy.approve": "Siyosat tasdiqlandi",
  "policy.delete-draft": "Siyosat loyihasi o'chirildi",
  "policy.reject-draft": "Siyosat loyihasi rad etildi",
  "policy.review": "Siyosat o'zgarishi ko'rib chiqildi",
  "announcement.create": "E'lon yaratildi",
  "announcement.delete": "E'lon o'chirildi",
  "feedback.reply": "Fikrga javob berildi",
  "feedback.delete": "Fikr o'chirildi",
  "settings.update": "Sozlamalar yangilandi",
  "seo.update": "SEO sozlamalari yangilandi",
  "seo.delete": "SEO sozlamalari o'chirildi",
  "backup.create": "Zaxira nusxasi yaratildi",
  "backup.upload": "Zaxira kanalga yuklandi",
  "backup.restore": "Zaxira tiklandi",
  "backup.delete": "Zaxira o'chirildi",
  "telegram.settings": "Telegram sozlamalari yangilandi",
  "email.test": "Sinov xati yuborildi",
  "email.otp.revoke": "OTP bekor qilindi",
  "email.otp.resend": "OTP qayta yuborildi",
  "email.otp.reveal": "OTP ko'rib chiqildi",
  "quiz.approve": "Viktorina tasdiqlandi",
  "quiz.reject": "Viktorina rad etildi",
  "quiz.delete": "Viktorina o'chirildi",
};

export function AdminAuditLogsTab() {
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ logs: AuditLogEntry[] }>("/api/admin/audit-logs")
      .then((d) => setAudit(d.logs))
      .catch(() => setError("Loglarni yuklab bo'lmadi"));
  }, []);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Admin audit loglar"
        subtitle="Barcha muhim admin amallari (tasdiqlash, bloklash, o'chirish va boshqalar)."
      />
      {error && <ErrorNote text={error} />}

      {audit.length === 0 && <EmptyState text="Audit yozuvlari yo'q." />}
      {audit.length > 0 && (
        <AdminCard className="p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-4 py-3">Vaqt</th>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Amal</th>
                <th className="px-4 py-3">Tafsilot</th>
                <th className="hidden px-4 py-3 md:table-cell">IP</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {new Date(log.createdAt).toLocaleString("uz-UZ")}
                  </td>
                  <td className="break-all px-4 py-3 text-xs text-slate-700 dark:text-slate-300">
                    {log.adminEmail ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <Badge tone="slate">{actionLabel[log.action] ?? log.action}</Badge>
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {log.detail ?? "—"}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-slate-400 dark:text-slate-500 md:table-cell">{log.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminCard>
      )}
    </div>
  );
}