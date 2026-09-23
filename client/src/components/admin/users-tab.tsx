"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  AdminActionMenu,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminSelect,
  Badge,
  Checkbox,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import { isPremiumActive } from "@/lib/premium";
import type { AdminUser } from "@/lib/types";

function vipExpiry(days: string): string | null {
  return days === "forever" ? null : new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000).toISOString();
}

export function AdminUsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [blocked, setBlocked] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [vipDays, setVipDays] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const load = useCallback(async (query: string, r: string, b: string) => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (r) params.set("role", r);
      if (b) params.set("blocked", b);
      const data = await api<{ users: AdminUser[]; total: number }>(`/api/admin/users?${params.toString()}`);
      setUsers(data.users);
      setTotal(data.total);
      setSelected(new Set());
    } catch {
      setError("Foydalanuvchilarni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void load(search, role, blocked), 250);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [load, search, role, blocked]);

  async function runAction(path: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(path, { method: "POST" });
      await load(search, role, blocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Amal bajarilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: string): Promise<void> {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>("/api/admin/users/bulk", {
        method: "POST",
        body: { ids, action },
      });
      setSelected(new Set());
      await load(search, role, blocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Amal bajarilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function runRole(u: AdminUser, nextRole: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/users/${u.id}/role`, {
        method: "PATCH",
        body: { role: nextRole },
      });
      await load(search, role, blocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rol o'zgartirilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function grantPremium(u: AdminUser): Promise<void> {
    const days = vipDays[u.id] ?? "30";
    const expiresAt = vipExpiry(days);
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/users/${u.id}/premium`, {
        method: "POST",
        body: { isPremium: true, expiresAt },
      });
      await load(search, role, blocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "VIP berilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function revokePremium(u: AdminUser): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/users/${u.id}/premium`, {
        method: "POST",
        body: { isPremium: false, expiresAt: null },
      });
      await load(search, role, blocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "VIP olib tashlanmadi");
    } finally {
      setBusy(false);
    }
  }

  async function revokeSuperApproval(u: AdminUser): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/users/${u.id}/super-approve`, { method: "DELETE" });
      await load(search, role, blocked);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tasdiqlash bekor qilinmadi");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = users.length > 0 && users.every((u) => selected.has(u.id));

  return (
    <div className="space-y-4">
      <PageTitle
        title="Foydalanuvchilar"
        subtitle={`Jami: ${total} ta foydalanuvchi.`}
        actions={
          selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Tanlangan: {selected.size}
              </span>
              <AdminButton variant="success" disabled={busy} onClick={() => void runBulk("block")}>
                Bloklash
              </AdminButton>
              <AdminButton variant="slate" disabled={busy} onClick={() => void runBulk("unblock")}>
                Blokdan chiqarish
              </AdminButton>
              <AdminButton variant="danger" disabled={busy} onClick={() => void runBulk("delete")}>
                Arxivga
              </AdminButton>
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        <AdminInput
          placeholder="Email, ism, telefon yoki Telegram ID bo'yicha..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-56 sm:max-w-xs"
        />
        <AdminSelect value={role} onChange={(e) => setRole(e.target.value)} className="w-full sm:w-auto py-1 text-xs">
          <option value="">Barcha rollar</option>
          <option value="SUPER_ADMIN">Super admin</option>
          <option value="ADMIN">Admin</option>
          <option value="USER">Foydalanuvchi</option>
        </AdminSelect>
        <AdminSelect value={blocked} onChange={(e) => setBlocked(e.target.value)} className="w-full sm:w-auto py-1 text-xs">
          <option value="">Bloklanganlar: barchasi</option>
          <option value="1">Bloklangan</option>
          <option value="0">Bloklanmagan</option>
        </AdminSelect>
      </div>

      {error && <ErrorNote text={error} />}
      {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}

      {!busy && users.length === 0 && <EmptyState text="Foydalanuvchilar topilmadi." />}

      {users.length > 0 && (
        <AdminCard className="p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="px-4 py-3">
                  <Checkbox
                    checked={allSelected}
                    onChange={(v) =>
                      setSelected(v ? new Set(users.map((u) => u.id)) : new Set())
                    }
                  />
                </th>
                <th className="px-4 py-3">Foydalanuvchi</th>
                <th className="px-4 py-3">Holat</th>
                <th className="hidden px-4 py-3 lg:table-cell">Telegram / Telefon</th>
                <th className="hidden px-4 py-3 lg:table-cell">Ro&apos;yxat</th>
                <th className="px-4 py-3 text-right">Harakatlar</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                return (
                  <tr
                    key={u.id}
                    className="border-b border-slate-100 last:border-0 dark:border-slate-800/60"
                  >
                    <td className="px-4 py-3">
                      <Checkbox checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                    </td>
                    <td className="min-w-0 px-4 py-3">
                      <Link
                        href={`/user?id=${u.id}`}
                        className="block break-all font-medium text-slate-900 hover:text-blue-600 hover:underline dark:text-white dark:hover:text-blue-400"
                      >
                        {u.email ?? u.telegramUsername ?? u.telegramId ?? "Telegram foydalanuvchisi"}
                      </Link>
                      <p className="break-words text-xs text-slate-500 dark:text-slate-400">
                        {[u.name, u.nickname ? `@${u.nickname}` : null].filter(Boolean).join(" · ") ||
                          "Ism kiritilmagan"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={u.role === "ADMIN" || u.role === "SUPER_ADMIN" ? "blue" : "slate"}>
                          {u.role === "SUPER_ADMIN" ? "Super admin" : u.role === "ADMIN" ? "Admin" : "Foydalanuvchi"}
                        </Badge>
                        {isPremiumActive(u) && <Badge tone="amber">VIP</Badge>}
                        {u.isSuperApproved && <Badge tone="emerald">Super Verified</Badge>}
                        {u.blocked && <Badge tone="rose">Bloklangan</Badge>}
                        {u.emailVerified && <Badge tone="emerald">Email</Badge>}
                        {u.phoneVerified && <Badge tone="emerald">Telefon</Badge>}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-500 dark:text-slate-400 lg:table-cell">
                      <p>{u.telegramId ?? "—"}</p>
                      <p>{u.phoneNumber ?? "—"}</p>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-slate-500 dark:text-slate-400 lg:table-cell">
                      {new Date(u.createdAt).toLocaleDateString("uz-UZ")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {u.role === "SUPER_ADMIN"
                          ? u.id === me?.id && (
                              <span className="py-1 text-xs text-slate-400 dark:text-slate-500">O&apos;zingiz</span>
                            )
                          : u.role === "ADMIN"
                            ? u.id === me?.id && (
                                <span className="py-1 text-xs text-slate-400 dark:text-slate-500">O&apos;zingiz</span>
                              )
                            : (
                              <AdminActionMenu
                                label="Amallar"
                                header={
                                  <AdminSelect
                                    value={vipDays[u.id] ?? "30"}
                                    onChange={(e) => setVipDays((prev) => ({ ...prev, [u.id]: e.target.value }))}
                                    className="w-full py-1 text-xs"
                                  >
                                    <option value="7">7 kun</option>
                                    <option value="30">30 kun</option>
                                    <option value="365">1 yil</option>
                                    <option value="forever">Umrbod</option>
                                  </AdminSelect>
                                }
                                items={[
                                  ...(me?.role === "SUPER_ADMIN"
                                    ? u.isSuperApproved
                                      ? [
                                          {
                                            label: "Super tasdiqlashni olib tashlash",
                                            danger: true,
                                            disabled: busy,
                                            onClick: () => void revokeSuperApproval(u),
                                          },
                                        ]
                                      : [
                                          {
                                            label: "⚡ Super tasdiqlash",
                                            disabled: busy,
                                            onClick: () => void runAction(`/api/admin/users/${u.id}/super-approve`),
                                          },
                                        ]
                                    : []),
                                  ...(isPremiumActive(u)
                                    ? [
                                        {
                                          label: "VIP uzaytirish",
                                          disabled: busy,
                                          onClick: () => void grantPremium(u),
                                        },
                                        {
                                          label: "VIP olib tashlash",
                                          danger: true,
                                          disabled: busy,
                                          onClick: () => void revokePremium(u),
                                        },
                                      ]
                                    : [
                                        {
                                          label: "VIP berish",
                                          disabled: busy,
                                          onClick: () => void grantPremium(u),
                                        },
                                      ]),
                                  {
                                    label: "Admin qilish",
                                    disabled: busy,
                                    onClick: () => void runRole(u, "ADMIN"),
                                  },
                                  u.blocked
                                    ? {
                                        label: "Blokdan chiqarish",
                                        disabled: busy,
                                        onClick: () => void runAction(`/api/admin/users/${u.id}/unblock`),
                                      }
                                    : {
                                        label: "Bloklash",
                                        disabled: busy,
                                        onClick: () => void runAction(`/api/admin/users/${u.id}/block`),
                                      },
                                  {
                                    label: "Arxivga",
                                    danger: true,
                                    disabled: busy,
                                    onClick: () => void runAction(`/api/admin/users/${u.id}/delete`),
                                  },
                                ]}
                              />
                            )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminCard>
      )}
    </div>
  );
}