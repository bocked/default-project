"use client";

/**
 * Last-resort boundary: catches failures in the ROOT layout itself (providers,
 * global CSS chunk, html/body). A regular `error.tsx` cannot cover these — if the
 * root layout throws, there is no parent boundary, so Next falls back to
 * `global-error.tsx`.
 *
 * Two hard constraints Next.js enforces here:
 *  1. It must be its own `<html>`/`<body>` — the root layout's shell is exactly
 *     what failed, so nothing above it can be reused.
 *  2. Global CSS does NOT apply, because the failure may be in that stylesheet's
 *     chunk. Everything is therefore inlined utility-free CSS via a <style> tag.
 *     Losing Tailwind here is the price of a page that renders at all.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="uz">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Iqtibosim — xatolik</title>
        <style>{`
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
            background: #0f172a;
            color: #f8fafc;
          }
          .card {
            width: 100%;
            max-width: 420px;
            padding: 32px;
            border: 1px solid #334155;
            border-radius: 16px;
            background: #1e293b;
            text-align: center;
          }
          h1 { margin: 0 0 8px; font-size: 20px; }
          p { margin: 0 0 24px; font-size: 14px; color: #94a3b8; line-height: 1.5; }
          .actions { display: flex; flex-direction: column; gap: 8px; }
          button, a {
            display: block;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 500;
            text-decoration: none;
            cursor: pointer;
          }
          button { border: 0; background: #3b82f6; color: #fff; }
          button:hover { background: #2563eb; }
          a { border: 1px solid #475569; color: #e2e8f0; }
          a:hover { background: #334155; }
          .digest {
            margin: 24px 0 0;
            font-size: 12px;
            color: #64748b;
            word-break: break-all;
          }
        `}</style>
      </head>
      <body>
        <div className="card">
          <h1>Saytni yuklashda xatolik</h1>
          <p>
            Ilgori bo&apos;lib chiqqan muammo sababli sahifa to&apos;liq
            ko&apos;rsatilmadi. Sahifani yangilab ko&apos;ring.
          </p>
          <div className="actions">
            <button type="button" onClick={reset}>
              Qayta urinish
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
              A plain <a> is required here, not a Link. This boundary renders its
              own <html>/<body> precisely because the root layout and, by
              extension, the router context failed. Client-side navigation is the
              thing most likely to be broken at this point, whereas a full
              document request re-establishes everything from scratch — which is
              exactly the recovery this screen should offer. */}
            <a href="/">Bosh sahifaga o&apos;tish</a>
          </div>
          {error.digest && <p className="digest">Texnik xabar: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}