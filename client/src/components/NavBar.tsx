"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export function NavBar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  function handleLogout(): void {
    logout();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-1.5 font-semibold text-slate-800">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-base font-bold text-white">
            &quot;
          </span>
          Iqtibosim
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
            Bosh sahifa
          </Link>
          <Link href="/profile" className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
            Profil
          </Link>
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              Chiqish
            </button>
          ) : (
            <Link
              href="/login"
              className="ml-1 rounded-lg bg-blue-600 px-3.5 py-1.5 font-medium text-white transition hover:bg-blue-700"
            >
              Kirish
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
