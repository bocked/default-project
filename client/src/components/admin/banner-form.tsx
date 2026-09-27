"use client";

import { useRef, useState } from "react";
import { uploadImage } from "@/lib/api";
import { AdminButton, AdminCard, AdminInput, AdminTextarea } from "@/components/admin-ui";
import { BannerBody, type BannerVariant } from "@/components/BannerBody";
import type { BannerDefinition } from "@/config/banners";

export type AdKind = "image" | "code";

/** Editable state for a single banner slot (mirrors the content keys). */
export interface SlotDraft {
  enabled: boolean;
  /** Chosen ad flavour — cosmetic switch that clears the opposite fields. */
  kind: AdKind;
  html: string;
  image: string;
  href: string;
  alt: string;
  /** Feed tab only: insert the in-feed banner after every N quotes. */
  every: string;
}

/** Accessible little power switch used for every banner toggle. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        checked ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

interface AdminBannerFormProps {
  title: string;
  description: string;
  hint: string;
  variant: BannerVariant;
  draft: SlotDraft;
  onChange: (next: SlotDraft) => void;
  /** Feed tab only: also render the "har nechta iqtibosdan keyin" input. */
  showEvery?: boolean;
}

/**
 * One compact form per banner slot: an on/off switch, an ad-flavour choice
 * (linked image vs. AdSense/Yandex code), the related inputs and a live
 * preview. All fields stay in the page-level draft — the tab's single
 * "O'zgarishlarni saqlash" button persists them.
 */
export function AdminBannerForm({
  title,
  description,
  hint,
  variant,
  draft,
  onChange,
  showEvery = false,
}: AdminBannerFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function setKind(kind: AdKind): void {
    onChange({
      ...draft,
      kind,
      // Keep the two flavours exclusive so the "html wins" rule in BannerBody
      // can never resurrect a code block after an admin switched to an image.
      ...(kind === "image" ? { html: "" } : { image: "", href: "", alt: "" }),
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await uploadImage(file);
      onChange({ ...draft, image: result.url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Rasm yuklanmadi");
    } finally {
      setUploading(false);
    }
  }

  const previewDef: BannerDefinition = {
    enabled: true,
    ...(draft.kind === "code" && draft.html.trim() !== "" ? { html: draft.html } : {}),
    ...(draft.kind === "image" && draft.image.trim() !== "" ? { image: draft.image } : {}),
    ...(draft.kind === "image" && draft.href.trim() !== "" ? { href: draft.href } : {}),
    ...(draft.kind === "image" && draft.alt.trim() !== "" ? { alt: draft.alt } : {}),
  };

  return (
    <AdminCard>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Yoqilgan</span>
            <Toggle
              checked={draft.enabled}
              label={`${title} — yoqilgan`}
              onChange={(v) => onChange({ ...draft, enabled: v })}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setKind("image")}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
              draft.kind === "image"
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            🖼 Rasm va havola
          </button>
          <button
            type="button"
            onClick={() => setKind("code")}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
              draft.kind === "code"
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            📄 AdSense / Yandex kodi
          </button>
        </div>

        {draft.kind === "image" ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Rasm <span className="text-slate-400">(kompyuterdan yuklash yoki URL)</span>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <AdminButton onClick={() => fileRef.current?.click()} disabled={uploading} variant="slate">
                  {uploading ? "Yuklanmoqda..." : "Rasm yuklash"}
                </AdminButton>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleFile(e)}
                />
                <AdminInput
                  value={draft.image}
                  onChange={(e) => onChange({ ...draft, image: e.target.value })}
                  placeholder="https://… rasm URL"
                />
              </div>
              {uploadError && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{uploadError}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Yo&apos;naltiruvchi havola
              </label>
              <AdminInput
                value={draft.href}
                onChange={(e) => onChange({ ...draft, href: e.target.value })}
                placeholder="https://… (Link URL)"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                ALT matni <span className="text-slate-400">(ixtiyoriy)</span>
              </label>
              <AdminInput
                value={draft.alt}
                onChange={(e) => onChange({ ...draft, alt: e.target.value })}
                placeholder="Rasm muqobil matni"
              />
            </div>
            <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              💡 {hint}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                AdSense / Yandex HTML-Script kodi
              </label>
              <AdminTextarea
                rows={7}
                className="font-mono text-xs"
                value={draft.html}
                onChange={(e) => onChange({ ...draft, html: e.target.value })}
                placeholder={"<script async src=\"https://…\"></script>\n<ins class=\"adsbygoogle\" …></ins>"}
              />
            </div>
          </div>
        )}

        {showEvery && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Har nechta iqtibosdan keyin ko&apos;rsatiladi
            </label>
            <AdminInput
              type="number"
              min={1}
              max={20}
              value={draft.every}
              onChange={(e) => onChange({ ...draft, every: e.target.value })}
              placeholder="4"
            />
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Masalan: 4 — har 4 iqtibosdan keyin reklama qo&apos;yiladi.
            </p>
          </div>
        )}

        <div>
          <p className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Oldindan ko&apos;rish</p>
          <div
            className={`overflow-hidden rounded-xl border p-2 ${
              draft.enabled
                ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/40"
                : "border-dashed border-slate-300 bg-slate-50/50 opacity-60 dark:border-slate-700 dark:bg-slate-900/30"
            }`}
          >
            {draft.enabled ? (
              <BannerBody def={previewDef} variant={variant} />
            ) : (
              <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                Banner o&apos;chirilgan — saytda ko&apos;rsatilmaydi.
              </p>
            )}
          </div>
        </div>
      </div>
    </AdminCard>
  );
}