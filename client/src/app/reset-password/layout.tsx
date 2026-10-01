import type { Metadata } from "next";
import { privateMeta } from "@/lib/siteMeta";

/** Metadata-only layout; `reset-password/page.tsx` is a Client Component and
 *  cannot export `metadata` itself. See the note in ../login/layout.tsx. */
export const metadata: Metadata = privateMeta({
  path: "/reset-password",
  title: "Yangi parol o'rnatish",
  description: "Iqtibosim hisobingiz uchun yangi parol o'rnatish.",
});

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}