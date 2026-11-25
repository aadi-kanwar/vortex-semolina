"use client";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { Doc } from "@convex/_generated/dataModel";
import { coerceFieldValue } from "@convex/lib/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/input";
import { Pill } from "@/components/ui/misc";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Def = Doc<"fieldDefinitions">;

export function FieldDisplay({ def, value, currency }: { def: Def; value: unknown; currency: string }) {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) {
    return <span className="text-fg-muted">—</span>;
  }
  switch (def.type) {
    case "currency":
      return <span className="num">{money(Number(value), currency)}</span>;
    case "number":
      return <span className="num">{Number(value).toLocaleString("en-IN")}</span>;
    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" className="link truncate" onClick={(e) => e.stopPropagation()}>
          {String(value).replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      );
    case "email":
      return (
        <a href={`mailto:${value}`} className="truncate hover:underline" onClick={(e) => e.stopPropagation()}>
          {String(value)}
        </a>
      );
    case "checkbox":
      return value ? <Check className="size-4 text-success" aria-label="Yes" /> : <span className="text-fg-muted">No</span>;
    case "single_select": {
      const o = def.options?.find((x) => x.value === value);
      return o ? <Pill color={o.color}>{o.label}</Pill> : <span>{String(value)}</span>;
    }
    case "multi_select": {
      const vals = Array.isArray(value) ? value : [value];
      return (
        <span className="flex gap-1 overflow-hidden">
          {vals.map((v) => {
            const o = def.options?.find((x) => x.value === v);
            return (
              <Pill key={String(v)} color={o?.color ?? "#A1A1AA"}>
                {o?.label ?? String(v)}
              </Pill>
            );
          })}
        </span>
      );
    }
    case "date":
      return <span className="num">{new Date(String(value) + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>;
    case "long_text":
      return <span className="line-clamp-1 whitespace-pre-wrap">{String(value)}</span>;
    default:
      return <span className="truncate">{String(value)}</span>;
  }
}

/** Validates client-side with the same zod-backed coercion the server uses. */
export function validateClient(def: Def, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: coerceFieldValue(def, raw) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function FieldEditor({
  def,
  value,
  onCommit,
  onCancel,
  className,
}: {
  def: Def;
  value: unknown;
  onCommit: (v: unknown) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<unknown>(value ?? (def.type === "multi_select" ? [] : ""));
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select?.();
  }, []);

  const commit = (v = draft) => {
    const res = validateClient(def, v);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onCommit(res.value);
  };
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") onCancel();
    if (e.key === "Enter" && (def.type !== "long_text" || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  };

  if (def.type === "single_select" || def.type === "multi_select") {
    const multi = def.type === "multi_select";
    const selected = multi ? ((draft as string[]) ?? []) : [draft as string];
    return (
      <Popover open onOpenChange={(o) => !o && (multi ? commit() : onCancel())}>
        <PopoverAnchor className={cn("h-full w-full", className)} />
        <PopoverContent className="w-56 p-1" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
          <div role="listbox" aria-label={def.label} aria-multiselectable={multi}>
            {!def.required && !multi ? (
              <button className="w-full rounded-[6px] px-2 py-1.5 text-left text-[14px] text-fg-muted hover:bg-surface-muted" onClick={() => commit("")}>
                Clear
              </button>
            ) : null}
            {(def.options ?? []).map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  role="option"
                  aria-selected={on}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left hover:bg-surface-muted focus-visible:bg-surface-muted"
                  onClick={() => {
                    if (!multi) return commit(o.value);
                    setDraft(on ? selected.filter((x) => x !== o.value) : [...selected, o.value]);
                  }}
                >
                  {multi ? <Checkbox checked={on} tabIndex={-1} aria-hidden /> : null}
                  <Pill color={o.color}>{o.label}</Pill>
                  {!multi && on ? <Check className="ml-auto size-4 text-primary" /> : null}
                </button>
              );
            })}
            {(def.options ?? []).length === 0 ? <p className="caption p-2">No options yet. Add some in Settings → Lead fields.</p> : null}
            {multi ? (
              <button className="mt-1 w-full rounded-[6px] bg-primary px-2 py-1.5 text-[13px] font-medium text-primary-fg" onClick={() => commit()}>
                Done
              </button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
  if (def.type === "checkbox") {
    // Checkbox commits immediately; no edit mode needed.
    return null;
  }
  if (def.type === "long_text") {
    return (
      <Textarea
        ref={ref}
        aria-label={def.label}
        value={String(draft ?? "")}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={keys}
        onBlur={() => commit()}
        className={cn("min-h-[90px]", className)}
        placeholder="⌘↵ to save"
      />
    );
  }
  const type = def.type === "number" || def.type === "currency" ? "number" : def.type === "date" ? "date" : def.type === "email" ? "email" : def.type === "url" ? "url" : def.type === "phone" ? "tel" : "text";
  return (
    <Input
      ref={ref}
      aria-label={def.label}
      type={type}
      value={String(draft ?? "")}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={keys}
      onBlur={() => commit()}
      className={cn("h-7", className)}
    />
  );
}
