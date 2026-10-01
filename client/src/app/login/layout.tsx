import type { Metadata } from "next";
import { privateMeta } from "@/lib/siteMeta";

/**
 * Metadata only — this layout deliberately renders no markup.
 *
 * `login/page.tsx` is a Client Component ("use client"), and a Client Component
 * cannot export `metadata`. Adding this Server Component wrapper is the
 * supported way to attach SEO tags to an interactive page. The page renders
 * inside the root layout's <body> exactly as before.
 *
 * Auth screens are noindex: they have nothing to rank for, and keeping
 * /login out of the index avoids thin-content dilution.
 */
export const metadata: Metadata = privateMeta({
  path: "/login",
  title: "Kirish",
  description: "Iqtibosim hisobingizga kiring.",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}