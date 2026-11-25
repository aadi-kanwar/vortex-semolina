"use client";
import { Search } from "lucide-react";
import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { useCommandPalette } from "./command-palette";

export function PageHeader({ title, subtitle, children }: { title: React.ReactNode; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[14px] text-fg-muted">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function SearchButton({ className }: { className?: string }) {
  const { open } = useCommandPalette();
  return (
    <button
      onClick={open}
      className={cn("flex h-8 w-44 items-center gap-2 rounded-[8px] border border-border bg-surface px-2.5 text-[14px] text-fg-muted hover:bg-surface-muted", className)}
      aria-label="Search (⌘K)"
    >
      <Search className="size-4" />
      <span className="flex-1 text-left">Search</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1400px] px-4 pb-10 pt-5 md:px-8 md:pt-6", className)}>{children}</div>;
}
