import type { Metadata } from "next";
import { privateMeta } from "@/lib/siteMeta";

/** Metadata-only layout; `profile/page.tsx` is a Client Component and cannot
 *  export `metadata` itself. noindex — this is a personal, per-user page. */
export const metadata: Metadata = privateMeta({
  path: "/profile",
  title: "Mening profilim",
  description: "Iqtibosim profilini tahrirlash.",
});

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}