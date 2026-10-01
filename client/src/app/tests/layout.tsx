import type { Metadata } from "next";
import { pageMeta } from "@/lib/siteMeta";

/** Metadata-only layout; `tests/page.tsx` is a Client Component and cannot
 *  export `metadata` itself. See the note in ../login/layout.tsx. */
export const metadata: Metadata = pageMeta({
  path: "/tests",
  title: "Testlar",
  description: "Aqliyatingizni o'lchovchi testlar va iqtiboslar to'plamiga qiziqish testlari.",
  keywords: ["test", "iqtibos testlari", "o'zbekcha test"],
});

export default function TestsLayout({ children }: { children: React.ReactNode }) {
  return children;
}