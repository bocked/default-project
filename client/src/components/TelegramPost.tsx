"use client";

import { useEffect, useRef } from "react";

const WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";

/**
 * Extracts `channel/123` from `https://t.me/channel/123` (also accepts
 * `telegram.me`). Returns null when the URL is not a valid post link.
 */
function parsePost(url: string): string | null {
  const match = url.trim().match(/^https:\/\/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{3,64}\/\d{1,15})\/?$/);
  return match ? match[1] : null;
}

/**
 * Renders a Telegram post embed using the official widget script. Following
 * the documented snippet pattern, a fresh <script data-telegram-post> element
 * is injected per post; the widget replaces itself with a resizable iframe
 * that shows the post exactly like in the Telegram app.
 */
export function TelegramPost({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const post = parsePost(url);
    if (!container || !post) return;

    const script = document.createElement("script");
    script.async = true;
    script.src = WIDGET_SRC;
    script.setAttribute("data-telegram-post", post);
    script.setAttribute("data-width", "100%");
    script.setAttribute("data-userpic", "true");
    if (document.documentElement.classList.contains("dark")) {
      script.setAttribute("data-dark", "1");
    }
    container.appendChild(script);

    return () => {
      container.replaceChildren();
    };
  }, [url]);

  if (!parsePost(url)) return null;

  return <div ref={containerRef} className="telegram-embed my-4" />;
}
