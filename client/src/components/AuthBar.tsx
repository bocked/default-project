"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthProvider";

type Mode = "login" | "register";

export default function AuthBar() {
  const { user, loading, login, register, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") await register(username, password, displayName || undefined);
      else await login(username, password);
      setOpen(false);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <div className="animate-fade-in pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 shadow">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: user.color }} />
        <span className="max-w-32 truncate text-sm font-medium text-slate-700">{user.displayName}</span>
        {user.role !== "USER" && (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            {user.role}
          </span>
        )}
        <button
          className="ml-1 rounded-full px-2 py-0.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 active:scale-95"
          onClick={logout}
        >
          Chiqish
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto">
      <button
        className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-slate-700 shadow transition hover:bg-white active:scale-95"
        onClick={() => setOpen((o) => !o)}
      >
        Kirish
      </button>

      {open && (
        <div className="animate-slide-up absolute right-3 top-12 z-50 w-72 rounded-xl bg-white p-4 shadow-xl">
          <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              className={`flex-1 rounded-md py-1 text-sm font-medium transition active:scale-[0.98] ${mode === "login" ? "bg-white shadow" : "text-slate-500"}`}
              onClick={() => {
                setMode("login");
                setError(null);
              }}
            >
              Kirish
            </button>
            <button
              className={`flex-1 rounded-md py-1 text-sm font-medium transition active:scale-[0.98] ${mode === "register" ? "bg-white shadow" : "text-slate-500"}`}
              onClick={() => {
                setMode("register");
                setError(null);
              }}
            >
              {"Ro'yxatdan o'tish"}
            </button>
          </div>

          <form onSubmit={submit} className="space-y-2">
            {mode === "register" && (
              <input
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                placeholder="Ko'rinadigan ism (ixtiyoriy)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={32}
              />
            )}
            <input
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              minLength={mode === "register" ? 3 : 1}
              maxLength={64}
              required
            />
            <input
              className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              placeholder="Parol"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "register" ? 8 : 1}
              maxLength={128}
              required
            />
            {error && <p className="animate-shake text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-slate-800 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? "Ishlanmoqda..." : mode === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
            </button>
            {mode === "register" && (
              <p className="text-[11px] leading-4 text-slate-400">
                {"Ro'yxatdan o'tib, o'z elementlaringizni saqlaysiz. Parol kamida 8 belgi bo'lishi kerak."}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
