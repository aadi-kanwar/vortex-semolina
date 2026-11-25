"use client";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Segmented, Skeleton, Swatch } from "@/components/ui/misc";
import { useLocalState } from "@/hooks/use-local-state";
import { computeRange, type Range, type RangeKey } from "@/lib/ranges";
import { cn } from "@/lib/utils";

export function useDateRange() {
  const [key, setKey] = useLocalState<RangeKey>("dash.range", "month");
  const [custom, setCustom] = useLocalState<{ from: string; to: string }>("dash.custom", { from: "", to: "" });
  // Round to the minute so query args stay stable (and cached) between renders.
  const range = computeRange(key, custom);
  return { range, key, setKey, custom, setCustom };
}

export function DateRangeControl({ value, onChange, custom, setCustom }: { value: RangeKey; onChange: (k: RangeKey) => void; custom: { from: string; to: string }; setCustom: (c: { from: string; to: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(custom);
  return (
    <div className="flex items-center gap-1">
      <Segmented<RangeKey>
        ariaLabel="Date range"
        value={value}
        onChange={onChange}
        options={[
          { value: "week", label: "This week" },
          { value: "month", label: "This month" },
          { value: "30d", label: "Last 30 days" },
          ...(value === "custom" ? [{ value: "custom" as const, label: "Custom" }] : []),
        ]}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="More ranges">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen(true)}>Custom range…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Custom range" className="max-w-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.from || !draft.to || draft.from > draft.to) return;
              setCustom(draft);
              onChange("custom");
              setOpen(false);
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cr-from">From</Label>
                <Input id="cr-from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="cr-to">To</Label>
                <Input id="cr-to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="primary" type="submit" disabled={!draft.from || !draft.to || draft.from > draft.to}>
                Apply
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Panel({ title, meta, action, children, className }: { title: string; meta?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("card flex min-w-0 flex-col p-[18px]", className)} aria-label={title}>
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="card-title">{title}</h2>
          {meta ? <span className="caption num">{meta}</span> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="link shrink-0 text-[13px]">
      {children}
    </Link>
  );
}

export function Delta({ now, prev, label, format = (n: number) => n.toLocaleString("en-IN"), points }: { now: number | null; prev: number | null; label: string; format?: (n: number) => string; points?: boolean }) {
  if (now === null || prev === null) return <span className="caption">{label}</span>;
  const d = now - prev;
  if (d === 0) return <span className="caption">No change vs previous period</span>;
  const up = d > 0;
  return (
    <span className={cn("text-[13px] font-medium num", up ? "text-success" : "text-danger")}>
      {up ? "▲" : "▼"} {points ? `${Math.abs(d * 100).toFixed(0)} pts` : format(Math.abs(d))} <span className="font-normal text-fg-muted">vs previous period</span>
    </span>
  );
}

export function Kpi({ label, value, foot, tone, href, hrefLabel }: { label: string; value: React.ReactNode; foot?: React.ReactNode; tone?: "warning" | "hero"; href?: string; hrefLabel?: string }) {
  return (
    <div
      className={cn(
        "card flex min-h-[104px] flex-col justify-between p-[18px]",
        tone === "warning" && "border-warning-border bg-warning-bg",
        tone === "hero" && "border-transparent bg-hero text-hero-fg",
      )}
    >
      <div className={cn("text-[13px] font-medium", tone === "warning" ? "text-warning-fg" : tone === "hero" ? "text-hero-caption" : "text-fg-muted")}>{label}</div>
      <div className={cn("kpi-number mt-1", tone === "warning" && "text-warning-fg")}>{value}</div>
      <div className="mt-1 min-h-[18px]">
        {foot}
        {href ? (
          <Link href={href} className={cn("text-[13px] font-medium hover:underline", tone === "hero" ? "text-hero-fg" : tone === "warning" ? "text-warning-fg" : "link")}>
            {hrefLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Horizontal bar list: one bar per stage, scaled to the largest. */
export function BarList({ rows, right }: { rows: { id: string; name: string; color: string; count: number }[]; right?: (r: { count: number }, i: number) => React.ReactNode }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.id} className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-3 text-[14px]" title={`${r.name}: ${r.count.toLocaleString("en-IN")}`}>
          <span className="flex min-w-0 items-center gap-2">
            <Swatch color={r.color} />
            <span className="truncate text-fg-secondary">{r.name}</span>
          </span>
          <span className="h-2 overflow-hidden rounded-[4px] bg-surface-muted" aria-hidden>
            <span className="block h-full rounded-[4px] bg-primary transition-[width]" style={{ width: `${(r.count / max) * 100}%`, minWidth: r.count ? 4 : 0 }} />
          </span>
          <span className="num min-w-[3ch] text-right font-medium">{right ? right(r, i) : r.count.toLocaleString("en-IN")}</span>
        </li>
      ))}
    </ul>
  );
}

export function PanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-5" />
      ))}
    </div>
  );
}

export function DashSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-[12px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-[12px]" />
        <Skeleton className="h-64 rounded-[12px]" />
      </div>
    </div>
  );
}

export type { Range };
