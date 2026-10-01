import type { Metadata } from "next";
import { privateMeta } from "@/lib/siteMeta";

/** Metadata-only layout; `register/page.tsx` is a Client Component and cannot
 *  export `metadata` itself. See the note in ../login/layout.tsx. */
export const metadata: Metadata = privateMeta({
  path: "/register",
  title: "Ro'yxatdan o'tish",
  description: "Iqtibosimda bepul ro'yxatdan o'tib, iqtiboslar to'plamini kashf eting.",
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}