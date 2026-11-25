"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { CalendarDays, Check, Contact, Download, LayoutDashboard, Plus, Video, Wallet } from "lucide-react";
import { useApp } from "@/components/app-data";
import { VortexLogo, VortexMark } from "@/components/brand";
import { Page, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Avatar, Pill, Segmented, Skeleton, Swatch } from "@/components/ui/misc";
import { contrast } from "@/lib/colors";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Token table: name, light, dark, purpose (source of truth: globals.css). */
const TOKENS: [string, string, string, string][] = [
  ["--bg", "#FAFAFA", "#09090B", "App background"],
  ["--surface", "#FFFFFF", "#18181B", "Cards, sidebar, table, popovers"],
  ["--surface-muted", "#F4F4F5", "#202024", "Segmented controls, bar tracks, dividers"],
  ["--border", "#E4E4E7", "#27272A", "1px borders"],
  ["--text", "#18181B", "#FAFAFA", "Primary text, numbers"],
  ["--text-secondary", "#3F3F46", "#D4D4D8", "Nav items, secondary labels"],
  ["--text-muted", "#52525B", "#A1A1AA", "Captions, hints, table headers"],
  ["--primary", "#4F46E5", "#4F46E5", "Primary buttons, logo, bars"],
  ["--link", "#4338CA", "#A5B4FC", "Text links"],
  ["--accent-soft", "#EEF2FF", "#1E1B4B", "Active nav, Join, selected"],
  ["--accent-soft-fg", "#3730A3", "#C7D2FE", "Text on accent-soft"],
  ["--hero", "#312E81", "#3730A3", "Highlight cards"],
  ["--warning-bg", "#FFFBEB", "#2A1F0A", "Unassigned, Add Meet link"],
  ["--warning-fg", "#92400E", "#FCD34D", "Text on warning"],
  ["--success", "#15803D", "#4ADE80", "Positive deltas"],
  ["--danger", "#B91C1C", "#F87171", "Negative deltas, errors"],
];

/** Text/background pairs that must pass WCAG AA (4.5:1). */
const PAIRS: [string, string][] = [
  ["--text", "--bg"],
  ["--text-secondary", "--surface"],
  ["--text-muted", "--surface"],
  ["--text-muted", "--surface-muted"],
  ["--primary-fg", "--primary"],
  ["--link", "--surface"],
  ["--accent-soft-fg", "--accent-soft"],
  ["--hero-fg", "--hero"],
  ["--hero-caption", "--hero"],
  ["--warning-fg", "--warning-bg"],
  ["--success", "--surface"],
  ["--danger", "--surface"],
];

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Reads the live value of each token, so the page reflects the current theme. */
function useTokenValues(names: string[]) {
  const { resolvedTheme } = useTheme();
  const [vals, setVals] = useState<Record<string, string>>({});
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setVals(Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n).trim().toUpperCase()])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme]);
  return vals;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5" aria-labelledby={`ds-${title}`}>
      <h2 id={`ds-${title}`} className="card-title">
        {title}
      </h2>
      {hint ? <p className="caption mb-4 mt-1">{hint}</p> : <div className="mb-4" />}
      {children}
    </section>
  );
}

export function DesignSystemPage() {
  const { statuses, users, settings } = useApp();
  const { resolvedTheme } = useTheme();
  const names = [...new Set([...TOKENS.map((t) => t[0]), ...PAIRS.flat()])];
  const live = useTokenValues(names);
  const [seg, setSeg] = useState<"week" | "month" | "30d">("month");
  const dark = resolvedTheme === "dark";

  return (
    <Page>
      <PageHeader title="Design system" subtitle={`Tokens and components used across Vortex. Showing ${dark ? "dark" : "light"} mode; switch theme in the sidebar (⌘⇧L) to preview the other.`} />
      <div className="space-y-4">
        <Section title="Brand" hint="The mark uses currentColor, so it follows the theme. Wordmark: Sora 700, −0.035em tracking.">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <div className="grid h-36 place-items-center rounded-[10px] border border-border bg-surface">
              <VortexLogo className="scale-150" />
            </div>
            <div className="grid h-36 place-items-center rounded-[10px] bg-primary">
              <VortexMark className="size-16 text-primary-fg" />
            </div>
            <div className="grid h-36 place-items-center rounded-[10px] bg-surface-muted">
              <VortexMark className="size-16 text-fg" />
            </div>
            <div className="flex h-36 flex-col items-center justify-center gap-3 rounded-[10px] border border-dashed border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="Favicon" className="size-12 rounded-[10px]" />
              <Button asChild size="sm">
                <a href="/vortex-mark.svg" download>
                  <Download /> Mark (SVG)
                </a>
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Color tokens" hint="Defined once in globals.css (:root and .dark). Components never use raw hex.">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
            {TOKENS.map(([name, light, darkHex, use]) => (
              <div key={name} className="flex items-center gap-3 rounded-[8px] border border-border p-2">
                <span className="size-10 shrink-0 rounded-[8px] border border-border" style={{ background: `var(${name})` }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[13px] font-medium">{name}</div>
                  <div className="caption truncate">{use}</div>
                  <div className="num text-[12px] text-fg-muted">
                    <span className={cn(!dark && "font-semibold text-fg")}>{light}</span> · <span className={cn(dark && "font-semibold text-fg")}>{darkHex}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Contrast" hint={`Live check of text/background pairs in ${dark ? "dark" : "light"} mode. Target: WCAG AA, 4.5:1.`}>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
            {PAIRS.map(([fg, bg]) => {
              const f = live[fg];
              const b = live[bg];
              const ratio = f?.startsWith("#") && b?.startsWith("#") ? contrast(hexToRgb(f), hexToRgb(b)) : null;
              const pass = ratio !== null && ratio >= 4.5;
              return (
                <div key={fg + bg} className="flex items-center gap-3 rounded-[8px] border border-border p-2">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[8px] border border-border text-[15px] font-semibold" style={{ background: `var(${bg})`, color: `var(${fg})` }}>
                    Aa
                  </span>
                  <div className="min-w-0 flex-1 font-mono text-[12px] text-fg-secondary">
                    <div className="truncate">{fg}</div>
                    <div className="truncate text-fg-muted">on {bg}</div>
                  </div>
                  <span className={cn("num text-[13px] font-semibold", pass ? "text-success" : "text-danger")}>{ratio ? `${ratio.toFixed(1)}:1` : "—"}</span>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Status colors" hint="Seeded statuses; admin-added ones get tints generated from their color, pushed until they pass AA in both modes.">
          <div className="flex flex-wrap gap-2">
            {statuses.map((s) => (
              <Pill key={s._id} color={s.color}>
                {s.name}
              </Pill>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            {statuses.map((s) => (
              <span key={s._id} className="flex items-center gap-1.5 text-[13px] text-fg-secondary">
                <Swatch color={s.color} /> <span className="num font-mono text-[12px]">{s.color}</span>
              </span>
            ))}
          </div>
        </Section>

        <Section title="Typography" hint="Inter for UI (tabular numbers everywhere), Sora for brand and page titles. Base 15px.">
          <div className="space-y-3">
            {[
              ["Page title · Sora 24/600", <span key="a" className="page-title">Team overview</span>],
              ["Hero number · 32/700", <span key="b" className="hero-number">{money(186000, settings.currency)}</span>],
              ["KPI number · 24/600", <span key="c" className="kpi-number">1,248</span>],
              ["Card title · 16/600", <span key="d" className="card-title">My pipeline</span>],
              ["Body · 15/400", <span key="e" className="text-[15px]">Client agreed to a call next Tuesday.</span>],
              ["Table cell · 14/400", <span key="f" className="text-[14px]">Northwind · Sydney, Australia</span>],
              ["Caption · 13/400", <span key="g" className="caption">Updated 3 minutes ago</span>],
              ["Link", <a key="h" className="link text-[14px]" href="#">Calendar →</a>],
            ].map(([label, el]) => (
              <div key={label as string} className="grid grid-cols-[200px_1fr] items-baseline gap-4 border-b border-[var(--surface-muted)] pb-3 last:border-0">
                <span className="caption">{label}</span>
                {el}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons" hint="8px radius. One primary action per view.">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">
              <Plus /> Primary
            </Button>
            <Button>Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="soft">
              <Video /> Join
            </Button>
            <Button variant="warning">Add Meet link</Button>
            <Button variant="danger">Delete</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Icon button">
              <Check />
            </Button>
          </div>
        </Section>

        <Section title="Form controls">
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ds-in">Text input</Label>
              <Input id="ds-in" placeholder="name@company.com" />
            </div>
            <div>
              <Label htmlFor="ds-sel">Select</Label>
              <NativeSelect id="ds-sel" defaultValue="m">
                <option value="m">Member</option>
                <option value="a">Admin</option>
              </NativeSelect>
            </div>
            <label className="flex items-center gap-2 text-[14px]">
              <Checkbox defaultChecked /> Checkbox
            </label>
            <Segmented
              ariaLabel="Date range example"
              value={seg}
              onChange={setSeg}
              options={[
                { value: "week", label: "This week" },
                { value: "month", label: "This month" },
                { value: "30d", label: "Last 30 days" },
              ]}
            />
          </div>
        </Section>

        <Section title="Cards" hint="12px radius, 1px border, no shadows. Hero = the one highlight number on a screen.">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <div className="card p-[18px]">
              <div className="text-[13px] font-medium text-fg-muted">Deals won</div>
              <div className="kpi-number mt-1">12</div>
              <div className="num mt-1 text-[13px] font-medium text-success">▲ 3 vs previous period</div>
            </div>
            <div className="card border-warning-border bg-warning-bg p-[18px]">
              <div className="text-[13px] font-medium text-warning-fg">Unassigned</div>
              <div className="kpi-number mt-1 text-warning-fg">48</div>
              <a className="text-[13px] font-medium text-warning-fg" href="#">Assign in bulk →</a>
            </div>
            <div className="card border-transparent bg-hero p-[18px] text-hero-fg">
              <div className="text-[13px] font-medium text-hero-caption">Commission payable</div>
              <div className="kpi-number mt-1">{money(42750, settings.currency)}</div>
              <div className="text-[13px] font-medium">Review &amp; mark paid →</div>
            </div>
            <div className="card space-y-2 p-[18px]">
              <div className="caption">Loading state</div>
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-4" />
            </div>
          </div>
        </Section>

        <Section title="Calendar events" hint="Dashed = requested (needs Meet link), solid = scheduled, muted = completed / cancelled.">
          <div className="flex flex-wrap gap-3">
            {[
              ["ev-requested", "#F59E0B", "Requested"],
              ["ev-scheduled", "#8B5CF6", "Scheduled"],
              ["ev-closed", "#A1A1AA", "Completed"],
              ["ev-closed ev-cancelled", "#A1A1AA", "Cancelled"],
            ].map(([cls, color, label]) => (
              <div key={label} style={{ "--ev": color } as React.CSSProperties} className={cn("w-44 rounded-[6px] px-2 py-1 text-[12px]", cls)}>
                <div className="ev-title font-semibold">Olivia Smith</div>
                <div className="opacity-80">10:30 AM · {label}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Avatars & icons" hint="Initials on pastel pairs, picked from the user id; inverted in dark mode. Icons: lucide, 18px nav, stroke 2.">
          <div className="flex flex-wrap items-center gap-3">
            {users.slice(0, 8).map((u) => (
              <span key={u._id} className="flex items-center gap-1.5 text-[14px]">
                <Avatar id={u._id} name={u.name} size={28} /> {u.name}
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-4 text-fg-secondary">
            {[LayoutDashboard, Contact, CalendarDays, Wallet].map((I, i) => (
              <I key={i} className="size-[18px]" strokeWidth={2} />
            ))}
          </div>
        </Section>

        <Section title="Shape & spacing">
          <div className="flex flex-wrap items-end gap-4">
            {[
              ["Card", 12],
              ["Button / input", 8],
              ["Nav item", 7],
              ["Pill", 999],
            ].map(([label, r]) => (
              <div key={label as string} className="text-center">
                <div className="mb-1 h-14 w-24 border border-border bg-surface-muted" style={{ borderRadius: r as number }} />
                <span className="caption">
                  {label} · {r === 999 ? "full" : `${r}px`}
                </span>
              </div>
            ))}
          </div>
          <p className="caption mt-4">Page padding 24px top / 32px sides · 12px between KPI cards · 16px between panels · 18–20px inside cards.</p>
        </Section>
      </div>
    </Page>
  );
}
