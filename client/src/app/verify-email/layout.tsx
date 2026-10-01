import type { Metadata } from "next";
import { privateMeta } from "@/lib/siteMeta";

/** Metadata-only layout; `verify-email/page.tsx` is a Client Component and
 *  cannot export `metadata` itself. See the note in ../login/layout.tsx. */
export const metadata: Metadata = privateMeta({
  path: "/verify-email",
  title: "Email tasdiqlash",
  description: "Ro'yxatdan o'tgan pochta manzilini tasdiqlang.",
});

export default function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
  return children;
}