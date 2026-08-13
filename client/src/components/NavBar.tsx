"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { ThemeToggle } from "./ThemeToggle";
import { TestModeBanner } from "./TestModeBanner";
import type { Category, Tag } from "@/lib/types";

const navLink =
  "rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white";

const dropdownButton = (active: boolean) =>
  `flex items-center gap-1 rounded-lg px-3 py-1.5 transition ${
    active
      ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
  }`;

const panel =
  "absolute right-0 top-full z-50 mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900";

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
          <Link href="/" className={navLink}>
            Bosh sahifa
          </Link>
          <FilterDropdowns />
          <Link href="/about" className={navLink}>
            Sayt haqida
          </Link>
          <Link href="/profile" className={navLink}>
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
              className={navLink}
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

type OpenMenu = "search" | "filters" | null;

function FilterDropdowns() {
  const [open, setOpen] = useState<OpenMenu>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={rootRef} className="flex items-center gap-1">
      <SearchDropdown open={open === "search"} onToggle={() => setOpen(open === "search" ? null : "search")} />
      <FiltersDropdown open={open === "filters"} onToggle={() => setOpen(open === "filters" ? null : "filters")} />
    </div>
  );
}

function DropdownTrigger({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-haspopup="menu" aria-expanded={open} className={dropdownButton(open)}>
      {label}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

function SearchDropdown({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <DropdownTrigger label="Qidiruv" open={open} onToggle={onToggle} />
      {open && (
        <Suspense fallback={null}>
          <SearchPanel onClose={onToggle} />
        </Suspense>
      )}
    </div>
  );
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [text, setText] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    },
    []
  );

  function applySearch(value: string): void {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  function onChange(value: string): void {
    setText(value);
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => applySearch(value.trim()), 350);
  }

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    applySearch(text.trim());
    onClose();
  }

  return (
    <div className={`${panel} w-80`}>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          autoFocus
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Iqtibos, muallif yoki heshteg..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
        >
          Qidirish
        </button>
      </form>
    </div>
  );
}

function FiltersDropdown({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="relative">
      <DropdownTrigger label="Kategoriyalar va Heshteglar" open={open} onToggle={onToggle} />
      {open && (
        <Suspense fallback={null}>
          <FiltersPanel onClose={onToggle} />
        </Suspense>
      )}
    </div>
  );
}

function FiltersPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const category = searchParams.get("category") ?? "";
  const tag = searchParams.get("tag") ?? "";

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ categories: Category[] }>("/api/categories").catch(() => ({ categories: [] as Category[] })),
      api<{ tags: Tag[] }>("/api/tags").catch(() => ({ tags: [] as Tag[] })),
    ]).then(([cats, tg]) => {
      if (cancelled) return;
      setCategories(cats.categories);
      setTags(tg.tags);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function apply(updates: { category?: string; tag?: string }): void {
    const params = new URLSearchParams(searchParams.toString());
    if ("category" in updates) {
      if (updates.category) params.set("category", updates.category);
      else params.delete("category");
    }
    if ("tag" in updates) {
      if (updates.tag) params.set("tag", updates.tag);
      else params.delete("tag");
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/", { scroll: false });
    onClose();
  }

  return (
    <div className={`${panel} w-80`}>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Kategoriyalar
      </p>
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={!category} onClick={() => apply({ category: "", tag: "" })}>
          Barchasi
        </FilterChip>
        {categories.map((c) => (
          <FilterChip key={c.id} active={category === c.slug} onClick={() => apply({ category: c.slug })}>
            {c.name}
          </FilterChip>
        ))}
        {loading && <span className="px-1 py-1 text-xs text-slate-400 dark:text-slate-500">Yuklanmoqda...</span>}
      </div>
      <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Heshteglar
      </p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <FilterChip key={t.id} active={tag === t.slug} onClick={() => apply({ tag: t.slug })}>
            #{t.name}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
