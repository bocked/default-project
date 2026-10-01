import type { Metadata } from "next";
import AdminShell from "./AdminShell";
import { privateMeta } from "@/lib/siteMeta";

/**
 * Server layout for the admin panel — owns the SEO metadata, delegates the UI
 * to AdminShell.
 *
 * WHY THE SPLIT: the panel needs a Client Component (it reads the session from
 * sessionStorage, filters nav items by live permissions and redirects
 * unauthenticated visitors), but a Client Component cannot export `metadata`.
 * So the shell moved to ./AdminShell.tsx and this thin Server Component — which
 * keeps the real markup free of any auth concern — exports the tags.
 *
 * Everything under /admin must stay out of search indexes: these pages are
 * behind auth and render no content for a crawler (they read sessionStorage), so
 * an indexed admin URL would be a thin-content page inviting traffic to the
 * login redirect. `privateMeta` emits robots noindex/nofollow, nofollow googlebot
 * and an og:noindex hint; the robots block below is a second, explicit layer.
 *
 * None of the nested /admin/* pages define their own metadata — being Client
 * Components they could not — so they all inherit this.
 */
export const metadata: Metadata = {
  ...privateMeta({
    path: "/admin",
    title: "Admin panel",
    description: "Iqtibosim boshqaruv paneli.",
  }),
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}