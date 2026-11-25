"use client";
import * as React from "react";
import Image from "next/image";
import { avatarClass, pillStyle } from "@/lib/colors";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} aria-hidden />;
}

export function Pill({ color, children, className }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <span style={pillStyle(color)} className={cn("pill inline-flex h-[22px] max-w-full items-center truncate rounded-full px-2 text-[12px] font-medium", className)}>
      {children}
    </span>
  );
}

export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span style={{ "--sw": color } as React.CSSProperties} className={cn("swatch inline-block size-2.5 shrink-0 rounded-[3px]", className)} aria-hidden />;
}

export function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ id, name, url, size = 22, className }: { id?: string; name?: string; url?: string; size?: number; className?: string }) {
  if (url) {
    return <Image src={url} alt={name ?? ""} width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold", avatarClass(id), className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.42) }}
    >
      {initials(name)}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex h-8 items-center rounded-[8px] bg-surface-muted p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-7 items-center justify-center gap-1 rounded-[6px] px-2.5 text-[12px] font-medium text-fg-muted transition-colors hover:text-fg [&_svg]:size-3.5",
            value === o.value && "bg-surface text-fg shadow-seg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="mb-1 grid size-10 place-items-center rounded-full bg-surface-muted text-fg-muted [&_svg]:size-5">{icon}</div> : null}
      <div className="text-[14px] font-medium">{title}</div>
      {hint ? <p className="caption max-w-sm">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-[4px] border border-border bg-surface-muted px-1 text-[10px] font-medium text-fg-muted">{children}</kbd>;
}
