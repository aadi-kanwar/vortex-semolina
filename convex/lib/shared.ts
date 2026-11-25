// Pure helpers shared by Convex functions and the Next.js client.
import { z } from "zod";

export type FieldType =
  | "text" | "long_text" | "number" | "currency" | "email" | "phone"
  | "url" | "date" | "single_select" | "multi_select" | "checkbox";

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "date", label: "Date" },
  { value: "single_select", label: "Single select" },
  { value: "multi_select", label: "Multi select" },
  { value: "checkbox", label: "Checkbox" },
];

export type FieldDefLike = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: { value: string; label: string; color: string }[];
};

export const MEET_LINK_RE = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
export const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

export function slugify(label: string): string {
  const s = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return /^[a-z]/.test(s) ? s : `f_${s || "field"}`.slice(0, 40);
}

export function normalizeEmail(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  return s.includes("@") ? s : undefined;
}

export function normalizePhone(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const digits = String(v).replace(/\D/g, "");
  // DECISION: compare on the last 10 digits so "+61 4…" and "04…" style
  // variants of the same number still match.
  return digits.length >= 6 ? digits.slice(-10) : undefined;
}

function isEmpty(v: unknown) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/** Coerce + validate one custom field value. Throws Error(message) on bad input. */
export function coerceFieldValue(def: FieldDefLike, raw: unknown): unknown {
  if (isEmpty(raw)) {
    if (def.required) throw new Error(`${def.label} is required`);
    return undefined;
  }
  const fail = (msg: string): never => {
    throw new Error(`${def.label}: ${msg}`);
  };
  switch (def.type) {
    case "text":
    case "long_text": {
      const s = String(raw).trim();
      const max = def.type === "text" ? 500 : 10000;
      if (s.length > max) fail(`must be at most ${max} characters`);
      if (!s && def.required) fail("is required");
      return s || undefined;
    }
    case "number":
    case "currency": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[,\s₹$€£]/g, ""));
      if (!Number.isFinite(n)) fail("must be a number");
      return n;
    }
    case "email": {
      const s = String(raw).trim();
      if (!z.string().email().safeParse(s).success) fail("must be a valid email");
      return s;
    }
    case "phone": {
      const s = String(raw).trim();
      if (!/^[+()\d\s.-]{5,25}$/.test(s)) fail("must be a valid phone number");
      return s;
    }
    case "url": {
      let s = String(raw).trim();
      if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
      if (!z.string().url().safeParse(s).success) fail("must be a valid URL");
      return s;
    }
    case "date": {
      if (typeof raw === "number") {
        // Excel serial date
        const d = new Date(Math.round((raw - 25569) * 86400000));
        return d.toISOString().slice(0, 10);
      }
      const s = String(raw).trim();
      if (dateRe.test(s)) return s;
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) fail("must be a date (YYYY-MM-DD)");
      return d.toISOString().slice(0, 10);
    }
    case "single_select": {
      const s = String(raw).trim();
      const opt = def.options?.find(
        (o) => o.value === s || o.label.toLowerCase() === s.toLowerCase(),
      );
      if (!opt) fail(`"${s}" is not an option`);
      return opt!.value;
    }
    case "multi_select": {
      const parts = Array.isArray(raw) ? raw.map(String) : String(raw).split(/[,;]/);
      const out: string[] = [];
      for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
        const opt = def.options?.find(
          (o) => o.value === p || o.label.toLowerCase() === p.toLowerCase(),
        );
        if (!opt) fail(`"${p}" is not an option`);
        if (!out.includes(opt!.value)) out.push(opt!.value);
      }
      if (out.length === 0 && def.required) fail("is required");
      return out.length ? out : undefined;
    }
    case "checkbox": {
      if (typeof raw === "boolean") return raw;
      const s = String(raw).trim().toLowerCase();
      if (["true", "yes", "y", "1", "x", "✓"].includes(s)) return true;
      if (["false", "no", "n", "0"].includes(s)) return false;
      return fail("must be yes/no");
    }
  }
}

const TEXTY: FieldType[] = ["text", "long_text", "email", "phone", "url", "single_select", "multi_select"];

export function buildSearchText(defs: FieldDefLike[], fields: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const d of defs) {
    if (!TEXTY.includes(d.type)) continue;
    const val = fields[d.key];
    if (isEmpty(val)) continue;
    if (d.type === "single_select" || d.type === "multi_select") {
      const vals = Array.isArray(val) ? val : [val];
      for (const x of vals) parts.push(d.options?.find((o) => o.value === x)?.label ?? String(x));
    } else {
      parts.push(String(val));
      if (d.type === "phone") parts.push(String(val).replace(/\D/g, ""));
    }
  }
  return parts.join(" ").slice(0, 4000);
}

/** Display name for a lead: Name field, else company, else email. */
export function leadTitle(fields: Record<string, unknown>): string {
  return String(fields.name || fields.company || fields.email || "Untitled lead");
}

export const SLOT_MINUTES = 30;

export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}
