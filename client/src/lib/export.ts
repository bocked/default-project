import type { CanvasItem, ItemType } from "./types";

export interface ExportItem {
  id: string;
  type: ItemType;
  content: string;
  x: number;
  y: number;
  color: string | null;
  width: number | null;
  height: number | null;
  reactions: Record<string, number>;
}

export type ExportFormat = "png" | "svg";

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const FONT_SIZE = 14;
const LINE_HEIGHT = 20;
const PADDING_X = 24;
const PADDING_Y = 20;
const MAX_DIMENSION = 8000;
const SVG_PADDING = 40;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Rough measure matching the on-canvas rendering (14px, ~7.4px/char). */
function measureText(content: string, minW: number, maxW: number): { width: number; height: number; lines: string[] } {
  const lines = content.split("\n");
  let width = minW;
  for (const line of lines) {
    width = Math.max(width, Math.min(maxW, line.length * 7.4 + PADDING_X));
  }
  const height = Math.max(lines.length * LINE_HEIGHT + PADDING_Y, 60);
  return { width, height, lines };
}

function itemBox(item: ExportItem): { x: number; y: number; w: number; h: number } {
  if (item.type === "IMAGE") {
    const w = item.width ?? 288;
    const h = item.height ?? 288;
    return { x: item.x - w / 2, y: item.y - h / 2, w, h };
  }
  const { width, height } = measureText(item.content, item.type === "STICKY" ? 160 : 80, 256);
  return { x: item.x - width / 2, y: item.y - height / 2, w: width, h: height };
}

function svgForItem(item: ExportItem): string {
  const box = itemBox(item);
  const cx = box.x + box.w / 2;
  const by = box.y + box.h / 2;

  if (item.type === "IMAGE") {
    const href = escapeXml(item.content);
    return `<image href="${href}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  const isSticky = item.type === "STICKY";
  const bg = item.color ?? (isSticky ? "#fef08a" : "#ffffff");
  const textColor = isSticky ? "#1e293b" : item.color ?? "#1e293b";
  const { lines } = measureText(item.content, isSticky ? 160 : 80, 256);

  const rect = isSticky
    ? `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="10" fill="${escapeXml(bg)}"/>`
    : `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="8" fill="#ffffff" stroke="#e2e8f0"/>`;

  const tspans = lines
    .map(
      (line, i) =>
        `<tspan x="${cx}" dy="${i === 0 ? 0 : LINE_HEIGHT}">${escapeXml(line) || " "}</tspan>`
    )
    .join("");

  return `${rect}<text x="${cx}" y="${by - ((lines.length - 1) * LINE_HEIGHT) / 2}" font-family="${FONT}" font-size="${FONT_SIZE}" fill="${escapeXml(textColor)}" text-anchor="middle">${tspans}</text>`;
}

function reactionsSvg(item: ExportItem): string {
  const entries = Object.entries(item.reactions).filter(([, count]) => count > 0);
  if (entries.length === 0) return "";
  const box = itemBox(item);
  const cx = box.x + box.w / 2;
  const y = box.y + box.h + 18;
  const text = entries.map(([emoji, count]) => `${emoji}${count > 1 ? count : ""}`).join("  ");
  return `<text x="${cx}" y="${y}" font-family="${FONT}" font-size="12" fill="#334155" text-anchor="middle">${escapeXml(text)}</text>`;
}

/** Builds a self-contained SVG document for the given items. */
export function buildSvg(items: ExportItem[]): { svg: string; width: number; height: number } {
  if (items.length === 0) {
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#ffffff"/></svg>`, width: 800, height: 600 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    const box = itemBox(item);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h + (Object.keys(item.reactions).length ? 24 : 0));
  }

  const width = Math.max(100, Math.ceil(maxX - minX + SVG_PADDING * 2));
  const height = Math.max(100, Math.ceil(maxY - minY + SVG_PADDING * 2));
  const body = items
    .map((item) => {
      const shift = `transform="translate(${SVG_PADDING - minX} ${SVG_PADDING - minY})"`;
      return `<g ${shift}>${svgForItem(item)}${reactionsSvg(item)}</g>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/><g>${body}</g></svg>`;
  return { svg, width, height };
}

function download(filename: string, content: string | Blob, mime?: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Fetches remote images and inlines them as data URLs so the canvas stays untainted. */
async function inlineImages(svg: string, urls: string[]): Promise<string> {
  let out = svg;
  for (const url of urls) {
    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      out = out.split(escapeXml(url)).join(escapeXml(dataUrl));
    } catch {
      /* skip un-inlinable image */
    }
  }
  return out;
}

/** Downloads an SVG snapshot of the canvas. */
export async function exportSvg(items: ExportItem[], name: string): Promise<void> {
  const { svg } = buildSvg(items);
  download(`${name}.svg`, svg, "image/svg+xml");
}

/** Renders the snapshot to a canvas and downloads it as PNG. */
export async function exportPng(items: ExportItem[], name: string): Promise<void> {
  const { svg, width, height } = buildSvg(items);

  const imageUrls = items.filter((i) => i.type === "IMAGE").map((i) => i.content);
  const safeSvg = await inlineImages(svg, imageUrls);

  const scale = Math.min(1, MAX_DIMENSION / width, MAX_DIMENSION / height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d konteksti mavjud emas");

  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("SVG render qilib bo'lmadi"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(safeSvg)}`;
  });

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/png");
  const byteString = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  download(`${name}.png`, new Blob([bytes], { type: "image/png" }));
}

export function toExportItems(items: CanvasItem[]): ExportItem[] {
  return items.map((i) => ({
    id: i.id,
    type: i.type,
    content: i.content,
    x: i.x,
    y: i.y,
    color: i.color,
    width: i.width,
    height: i.height,
    reactions: i.reactions,
  }));
}
