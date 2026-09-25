/**
 * Cloudflare Pages Function for the homepage (`/`).
 *
 * When a link-preview crawler (Telegram, WhatsApp, VK, X/Twitter, Facebook,
 * Slack, ...) requests `/?quote=<id>`, it fetches that quote from the backend
 * API and injects OpenGraph / Twitter meta tags so the preview shows the quote
 * text and author instead of the generic site card. Every other request is
 * passed straight through to the static assets server.
 */

export interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

interface QuotePayload {
  id: string;
  text: string;
  displayAuthor: string;
}

interface ApiResponse {
  quote?: QuotePayload | null;
}

const BOT_RE = /telegrambot|whatsapp|facebookexternalhit|twitterbot|slackbot|discordbot|viber|skypeuripreview|pinterest|snapchat|tumblr|redditbot|vkshare|\bline\b|yandex|googlebot|linkedinbot|baiduspider/i;

const DEFAULT_TITLE = "Iqtibosim — iqtiboslar to'plami";
const DEFAULT_DESCRIPTION =
  "Fikrlarni to'playdigan, bo'limlar va heshteglar bo'yicha saralanadigan iqtiboslar sayti.";

const API_ORIGIN = "https://api.yerlikoglon.uz";

export const onRequestGet = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);

  const quoteId = url.searchParams.get("quote");
  if (url.pathname !== "/" || !quoteId) {
    return env.ASSETS.fetch(request);
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  if (!BOT_RE.test(userAgent)) {
    return env.ASSETS.fetch(request);
  }

  const htmlResponse = await env.ASSETS.fetch(request);
  const html = await htmlResponse.text();

  let title = DEFAULT_TITLE;
  let description = DEFAULT_DESCRIPTION;

  const payload = await fetchQuote(quoteId);
  if (payload) {
    const short = payload.text.length > 140 ? `${payload.text.slice(0, 137)}...` : payload.text;
    title = `\u201C${short}\u201D \u2014 ${payload.displayAuthor}`;
    description = `Iqtibosim — ${payload.displayAuthor} fikri. \u201CIqtibosim\u201D saytida o'qing.`;
  }

  const image = `${url.origin}/icons/icon-512.png`;
  const meta = [
    `<meta property="og:title" content="${escapeAttr(title)}" data-dynamic="og" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" data-dynamic="og" />`,
    `<meta property="og:type" content="website" data-dynamic="og" />`,
    `<meta property="og:url" content="${escapeAttr(url.href)}" data-dynamic="og" />`,
    `<meta property="og:site_name" content="Iqtibosim" data-dynamic="og" />`,
    `<meta property="og:image" content="${escapeAttr(image)}" data-dynamic="og" />`,
    `<meta name="twitter:card" content="summary" data-dynamic="og" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" data-dynamic="og" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" data-dynamic="og" />`,
    `<meta name="twitter:image" content="${escapeAttr(image)}" data-dynamic="og" />`,
  ].join("\n    ");

  // Drop any static-site OG / Twitter tags so the injected ones always win
  // regardless of whether the crawler prefers the first or last declaration.
  const cleaned = html.replace(
    /<meta[^>]*(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>/gi,
    ""
  );
  const out = cleaned.replace("</head>", `    ${meta}\n  </head>`);

  return new Response(out, {
    status: htmlResponse.status,
    headers: {
      "content-type": htmlResponse.headers.get("content-type") ?? "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-dynamic-og": "1",
    },
  });
};

async function fetchQuote(quoteId: string): Promise<QuotePayload | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${API_ORIGIN}/api/quotes/${encodeURIComponent(quoteId)}`, {
      headers: {
        "accept": "application/json",
        "user-agent": "IqtibosimOGPreview (+https://yerlikoglon.uz)",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ApiResponse;
    return data.quote ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}