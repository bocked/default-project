"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { NavBar } from "./NavBar";
import { WwwUzTracker } from "./WwwUzTracker";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Admin console gets a wider content area so tables and sidebars fit.
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  const [footer, setFooter] = useState("Iqtibosim — fikrlarni to'playdigan joy");

  useEffect(() => {
    void api<{ content: Record<string, string> }>("/api/content")
      .then((d) => {
        if (typeof d.content["footer.about"] === "string") setFooter(d.content["footer.about"]);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <WwwUzTracker />
      <NavBar />
      <main className={`mx-auto w-full flex-1 px-4 py-6 ${isAdmin ? "max-w-6xl" : "max-w-3xl"}`}>
        {children}
      </main>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        {footer}
      </footer>
    </div>
  );
}
