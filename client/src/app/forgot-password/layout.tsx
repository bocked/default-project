import type { Metadata } from "next";
import { privateMeta } from "@/lib/siteMeta";

/** Metadata-only layout; `forgot-password/page.tsx` is a Client Component and
 *  cannot export `metadata` itself. See the note in ../login/layout.tsx. */
export const metadata: Metadata = privateMeta({
  path: "/forgot-password",
  title: "Parolni tiklash",
  description: "Iqtibosim hisobingiz uchun parolni tiklash jarayonini boshlang.",
});

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}