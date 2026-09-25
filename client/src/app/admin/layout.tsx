"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useAdminSession } from "@/lib/admin-session";
import { AdminPushZone } from "@/components/admin-push-zone";

type PermissionKey = string;

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  superOnly?: boolean;
  /** Feature keys — ANY of them grants the section. Omitted = role-gated only. */
  permissions?: PermissionKey[];
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Boshqaruv paneli", exact: true },
  { href: "/admin/content", label: "Kontent", permissions: ["canManageQuotes", "canManageCategories"] },
  { href: "/admin/quizzes", label: "Testlar", permissions: ["canManageQuizzes"] },
  { href: "/admin/users", label: "Foydalanuvchilar", permissions: ["canViewUsers"] },
  {
    href: "/admin/communication",
    label: "Muloqot",
    permissions: ["canManageAnnouncements", "canManageFeedback"],
  },
  { href: "/admin/settings", label: "Sozlamalar", permissions: ["canManageSettings"] },
  { href: "/admin/sub-admins", label: "Sub-adminlar", superOnly: true },
  { href: "/admin/telegram", label: "Telegram Sozlamalari", superOnly: true },
  { href: "/admin/policies", label: "Siyosatlar" },
  { href: "/admin/email-management", label: "📧 Pochta Boshqaruvi", superOnly: true },
  { href: "/admin/audit", label: "Audit", permissions: ["canViewAudit"] },
];

/** Permission(s) guarding the section a pathname belongs to. */
function permissionsForPath(pathname: string): { superOnly?: boolean; keys: PermissionKey[] } {
  if (pathname?.startsWith("/admin/sub-admins") || pathname?.startsWith("/admin/telegram")) {
    return { superOnly: true, keys: [] };
  }
  for (const item of NAV) {
    const prefix = item.exact ? new RegExp(`^${item.href}$`) : new RegExp(`^${item.href}(/|$)`);
    if (item.href !== "/admin" && prefix.test(pathname ?? "")) {
      return { superOnly: item.superOnly, keys: item.permissions ?? [] };
    }
  }
  return { keys: [] };
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { session: sess, can, loading: sessLoading } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Yuklanmoqda...</p>;
  }

  if (!user) return null;

  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto mt-8 w-full max-w-sm">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-500/30 dark:bg-rose-950/30">
          <h1 className="text-lg font-semibold text-rose-800 dark:text-rose-300">Ruxsat yo&apos;q</h1>
          <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">Bu sahifa faqat adminlar uchun.</p>
        </div>
      </div>
    );
  }

  const isSuper = user.role === "SUPER_ADMIN";

  const visibleNav = NAV.filter((item) => {
    if (item.superOnly) return isSuper;
    if (item.permissions && item.permissions.length > 0) return item.permissions.some(can);
    return true;
  });

  // Deep-link guard: if the sidebar hides a section, a direct URL must not
  // render its content either (the backend enforces the same 403s).
  const guard = permissionsForPath(pathname ?? "");
  const accessDenied =
    (guard.superOnly && !isSuper) || (guard.keys.length > 0 && !guard.keys.some(can));

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="lg:w-52 lg:shrink-0">
        <nav className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none lg:sticky lg:top-20 lg:flex-col">
          {visibleNav.map((item) => {
            const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                    : "rounded-xl px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="mb-4">
          <AdminPushZone />
        </div>
        <main className="mx-auto w-full max-w-7xl">
          {sessLoading || !sess ? (
            <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Ruxsatlar tekshirilmoqda...</p>
          ) : accessDenied ? (
            <div className="mx-auto mt-8 w-full max-w-sm">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-700/40 dark:bg-amber-950/30">
                <h1 className="text-lg font-semibold text-amber-800 dark:text-amber-300">Ruxsat yo&apos;q</h1>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                  Bu bo&apos;limga kirish uchun sizda yetarli huquq yo&apos;q.
                </p>
                <Link
                  href="/admin"
                  className="mt-4 inline-block rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                >
                  Boshqaruv paneliga qaytish
                </Link>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}