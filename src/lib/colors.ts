import type { CSSProperties } from "react";

// Status pill tints are derived from the status color so admin-added
// statuses work too. Each pair is pushed until it passes WCAG AA (4.5:1).

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: RGB) => "#" + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lum = (c: RGB) => {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
export const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const cache = new Map<string, { lb: string; lf: string; db: string; df: string }>();

export function pillTints(color: string) {
  const hit = cache.get(color);
  if (hit) return hit;
  const c = /^#[0-9a-fA-F]{6}$/.test(color) ? hex(color) : hex("#A1A1AA");
  const lb = mix(c, WHITE, 0.88);
  let t = 0.45;
  let lf = mix(c, BLACK, t);
  while (contrast(lf, lb) < 4.6 && t < 0.95) lf = mix(c, BLACK, (t += 0.05));
  const db = mix(c, BLACK, 0.72);
  t = 0.45;
  let df = mix(c, WHITE, t);
  while (contrast(df, db) < 4.6 && t < 0.95) df = mix(c, WHITE, (t += 0.05));
  const out = { lb: toHex(lb), lf: toHex(lf), db: toHex(db), df: toHex(df) };
  cache.set(color, out);
  return out;
}

export function pillStyle(color: string): CSSProperties {
  const t = pillTints(color);
  return { "--pl-bg": t.lb, "--pl-fg": t.lf, "--pd-bg": t.db, "--pd-fg": t.df } as CSSProperties;
}

export function avatarClass(id: string | undefined) {
  if (!id) return "av-0";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `av-${h % 4}`;
}

export const PALETTE = ["#A1A1AA", "#3B82F6", "#0891B2", "#F59E0B", "#8B5CF6", "#4F46E5", "#16A34A", "#E11D48", "#EA580C", "#DB2777"];
