"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "./ThemeToggle";
import { TestModeBanner } from "./TestModeBanner";

export function NavBar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  function handleLogout(): void {
    logout();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <TestModeBanner />
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 font-serif text-lg font-bold text-white">
            &quot;
          </span>
          Iqtibosim
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <ThemeToggle />
          <Link href="/" className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
            Bosh sahifa
          </Link>
          <Link href="/about#asosiy" className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
            Asosiy sahifa va qidiruv
          </Link>
          <Link href="/about#kategoriyalar" className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
            Kategoriyalar va Heshteglar
          </Link>
          <Link href="/about" className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
            Sayt haqida
          </Link>
          <Link href="/profile" className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
            Profil
          </Link>
          {user?.role === "ADMIN" && (
            <Link href="/admin" className="rounded-lg px-3 py-1.5 text-amber-700 transition hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950">
              Admin
            </Link>
          )}
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              Chiqish
            </button>
          ) : (
            <Link
              href="/login"
              className="ml-1 rounded-lg bg-blue-600 px-3.5 py-1.5 font-medium text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
            >
              Kirish
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
