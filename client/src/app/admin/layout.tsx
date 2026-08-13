"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

const NAV = [
  { href: "/admin", label: "Boshqaruv paneli", exact: true },
  { href: "/admin/quotes", label: "Iqtiboslar" },
  { href: "/admin/users", label: "Foydalanuvchilar" },
  { href: "/admin/categories", label: "Bo'limlar" },
  { href: "/admin/hashtags", label: "Heshteglar" },
  { href: "/admin/bans", label: "Qora ro'yxat" },
  { href: "/admin/announcements", label: "E'lonlar" },
  { href: "/admin/feedback", label: "Shikoyatlar" },
  { href: "/admin/settings", label: "Sozlamalar" },
  { href: "/admin/seo", label: "SEO" },
  { href: "/admin/activity", label: "Faollik" },
  { href: "/admin/backup", label: "Zaxira" },
  { href: "/admin/content", label: "Kontent" },
  { href: "/admin/logs", label: "Loglar" },
  { href: "/admin/trash", label: "Arxiv" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Yuklanmoqda...</p>;
  }

  if (!user) return null;

  if (user.role !== "ADMIN") {
    return (
      <div className="mx-auto mt-8 w-full max-w-sm">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-500/30 dark:bg-rose-950/30">
          <h1 className="text-lg font-semibold text-rose-800 dark:text-rose-300">Ruxsat yo&apos;q</h1>
          <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">Bu sahifa faqat adminlar uchun.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="lg:w-52 lg:shrink-0">
        <nav className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none lg:sticky lg:top-20 lg:flex-col">
          {NAV.map((item) => {
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
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
