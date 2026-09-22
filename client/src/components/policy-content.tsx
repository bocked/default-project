"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PolicyResponse, PolicyType } from "@/lib/types";

/** Renders the DB-backed policy copy: markdown-lite where "## " lines become
 *  section headings and consecutive "- " lines become a bullet list. Anything
 *  else is rendered as a paragraph. */
function renderPolicyBlocks(content: string): React.ReactNode[] {
  const blocks = content.split(/\n{2,}/);
  const out: React.ReactNode[] = [];
  blocks.forEach((raw, i) => {
    const block = raw.trim();
    if (!block) return;
    if (block.startsWith("## ")) {
      out.push(
        <h2 key={`h-${i}`} className="text-lg font-semibold text-slate-900 dark:text-white">
          {block.slice(3).trim()}
        </h2>
      );
      return;
    }
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 1 && lines.every((l) => l.startsWith("- "))) {
      out.push(
        <ul key={`ul-${i}`} className="list-disc pl-6 space-y-2 text-slate-600 dark:text-slate-300">
          {lines.map((l, j) => (
            <li key={`li-${j}`}>{l.slice(2)}</li>
          ))}
        </ul>
      );
      return;
    }
    out.push(
      <p key={`p-${i}`} className="text-slate-600 dark:text-slate-300">
        {lines.join(" ")}
      </p>
    );
  });
  return out;
}

export function PolicyText({ content }: { content: string }) {
  return <>{renderPolicyBlocks(content)}</>;
}

interface PolicyViewerProps {
  type: PolicyType;
  /** Static legal copy shown until the live document loads, and used forever
   *  when the API is unreachable. */
  fallback: React.ReactNode;
}

/** Fetches the published (DB-backed) policy for `type` and renders it. Keeps
 *  rendering the static fallback until the live copy arrives so the pages and
 *  modal are never blank. */
export function PolicyViewer({ type, fallback }: PolicyViewerProps) {
  const [policy, setPolicy] = useState<PolicyResponse["policy"] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<PolicyResponse>(`/api/policies?type=${type}`)
      .then((d) => {
        if (cancelled) return;
        setPolicy(d.policy);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  if (!policy || failed) return <>{fallback}</>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Joriy versiya: {policy.version}
        {policy.publishedAt ? ` · Oxirgi yangilanish: ${new Date(policy.publishedAt).toLocaleDateString("uz-UZ")}` : ""}
      </p>
      <PolicyText content={policy.content} />
    </div>
  );
}