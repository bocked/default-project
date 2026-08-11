"use client";

import { useEffect, useState } from "react";
import { config } from "@/lib/config";

interface ServerStatus {
  state: "checking" | "online" | "offline";
  online?: number;
}

export default function Home() {
  const [status, setStatus] = useState<ServerStatus>({ state: "checking" });

  useEffect(() => {
    let cancelled = false;
    async function check(): Promise<void> {
      try {
        const [health, online] = await Promise.all([
          fetch(`${config.url}/api/health`),
          fetch(`${config.url}/api/online`),
        ]);
        const healthJson = await health.json();
        const onlineJson = await online.json();
        if (!cancelled) {
          setStatus({
            state: healthJson.ok ? "online" : "offline",
            online: typeof onlineJson.online === "number" ? onlineJson.online : undefined,
          });
        }
      } catch {
        if (!cancelled) setStatus({ state: "offline" });
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex h-full w-full items-center justify-center p-6">
      <section className="animate-slide-up w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-800">Yangi loyiha</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Bu yerda yangi g&apos;oya quriladi. Backend va frontend toza holatda tayyor.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-50 px-4 py-1.5 text-xs text-slate-500">
          <span
            className={`h-2 w-2 rounded-full ${
              status.state === "online" ? "bg-green-500" : status.state === "offline" ? "bg-red-500" : "bg-slate-300"
            }`}
          />
          {status.state === "checking"
            ? "Server tekshirilmoqda..."
            : status.state === "online"
              ? `Server ishlayapti (${status.online ?? 0} ulangan)`
              : "Serverga ulanib bo'lmadi"}
        </div>
      </section>
    </main>
  );
}
