import { Metadata } from "next";
import Link from "next/link";
import { TermsContent } from "@/components/legal-content";
import { PolicyViewer } from "@/components/policy-content";
import { pageMeta } from "@/lib/siteMeta";

// Bare title — the root layout's "%s | Iqtibosim" template appends the suffix.
export const metadata: Metadata = pageMeta({
  path: "/terms",
  title: "Foydalanish shartlari",
  description: "Iqtibosim saytidan foydalanish shartlari va qoidalari. Test rejimi va foydalanuvchi mas'uliyati haqida ma'lumot.",
});

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 space-y-8">
      <header>
        <h1 className="font-serif text-3xl font-bold text-slate-900 dark:text-white">Foydalanish shartlari</h1>
      </header>

      <PolicyViewer type="TERMS" fallback={<TermsContent />} />

      <footer className="pt-8 border-t border-slate-200 dark:border-slate-800">
        <Link href="/" className="text-blue-600 hover:underline dark:text-blue-400">← Bosh sahifaga qaytish</Link>
      </footer>
    </div>
  );
}