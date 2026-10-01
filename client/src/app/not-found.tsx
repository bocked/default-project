import Link from "next/link";

/**
 * 404 for unknown paths.
 *
 * Under `output: "export"` Next writes this to out/404.html, which is exactly
 * the file Cloudflare Pages serves for unmatched routes — so this renders as a
 * real styled page rather than Next's bare default, with no server involved.
 *
 * Server Component on purpose: it has no interactivity, so it ships no JS.
 * (The suggested-links list is static; the search box below is the only dynamic
 * part and is deliberately omitted to keep this dependency-free.)
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="mb-2 text-6xl font-bold text-slate-200 dark:text-slate-700">404</p>

      <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
        Sahifa topilmadi
      </h1>

      <p className="mb-6 max-w-sm text-sm text-slate-600 dark:text-slate-400">
        Siz izlagan sahifa mavjud emas yoki ko&apos;chirilgan bo&apos;lishi mumkin.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href="/"
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Bosh sahifa
        </Link>
        <Link
          href="/tests"
          className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Testlarni ko&apos;rish
        </Link>
      </div>
    </div>
  );
}