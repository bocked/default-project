"use client";

import { useState } from "react";

/** Circular avatar: renders the uploaded image when a valid URL is set, and
 *  falls back to initials (nickname / name / email) on a tinted disc. */
export function Avatar({
  url,
  name,
  size = 40,
  className = "",
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = getInitials(name);

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static export: plain img keeps remote avatars working without a loader
      <img
        src={url}
        alt={name ?? "Avatar"}
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-blue-100 font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </span>
  );
}

function getInitials(name?: string | null): string {
  const source = (name ?? "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}
