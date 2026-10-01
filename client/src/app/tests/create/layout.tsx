import type { Metadata } from "next";
import { pageMeta } from "@/lib/siteMeta";

/** Metadata-only layout; `tests/create/page.tsx` is a Client Component and
 *  cannot export `metadata` itself. See the note in ../login/layout.tsx. */
export const metadata: Metadata = pageMeta({
  path: "/tests/create",
  title: "Test yaratish",
  description: "O'zingizning iqtibos testini yarating va do'stlaringiz bilan bo'lishingiz mumkin.",
});

export default function TestsCreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}