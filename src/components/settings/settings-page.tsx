"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { FIELD_TYPES, slugify, type FieldType } from "@convex/lib/shared";
import { useApp } from "@/components/app-data";
import { TimezoneSelect } from "@/components/calendar/timezone-select";
import { Page, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Pill, Skeleton, Swatch } from "@/components/ui/misc";
import { useLocalState } from "@/hooks/use-local-state";
import { PALETTE } from "@/lib/colors";
import { cn, errorMessage } from "@/lib/utils";

type Tab = "general" | "fields" | "statuses" | "meetings";

async function attempt(p: Promise<unknown>, ok: string) {
  try {
    await p;
    toast.success(ok);
    return true;
  } catch (e) {
    toast.error(errorMessage(e));
    return false;
  }
}

function useDragList<T extends { _id: string }>(items: T[], onReorder: (ids: string[]) => void) {
  const [drag, setDrag] = useState<string | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const ids = items.map((i) => i._id);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorder(ids);
  };
  const props = (id: string, idx: number) => ({
    draggable: true,
    onDragStart: () => setDrag(id),
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: () => {
      if (drag && drag !== id) move(items.findIndex((i) => i._id === drag), idx);
      setDrag(null);
    },
    className: cn(drag === id && "opacity-50"),
  });
  return { props, move };
}

function ColorPicker({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={label}>
      {PALETTE.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value.toLowerCase() === c.toLowerCase()} aria-label={c} onClick={() => onChange(c)} className={cn("grid size-5 place-items-center rounded-full", value.toLowerCase() === c.toLowerCase() && "ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--surface)]")}>
          <Swatch color={c} className="size-4 rounded-full" />
        </button>
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Custom color" className="size-6 cursor-pointer rounded border-0 bg-transparent" />
    </div>
  );
}

type Opt = { value: string; label: string; color: string };
function OptionsEditor({ options, onChange }: { options: Opt[]; onChange: (o: Opt[]) => void }) {
  const [label, setLabel] = useState("");
  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <div key={o.value} className="flex items-center gap-2">
          <Pill color={o.color}>{o.label}</Pill>
          <Input aria-label="Option label" value={o.label} onChange={(e) => onChange(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="h-7 w-40" />
          <ColorPicker label={`Color for ${o.label}`} value={o.color} onChange={(c) => onChange(options.map((x, j) => (j === i ? { ...x, color: c } : x)))} />
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${o.label}`} onClick={() => onChange(options.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input placeholder="New option" value={label} onChange={(e) => setLabel(e.target.value)} className="h-7 w-48" onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!label.trim()) return;
            onChange([...options, { label: label.trim(), value: slugify(label), color: PALETTE[options.length % PALETTE.length] }]);
            setLabel("");
          }
        }} />
        <Button type="button" size="sm" onClick={() => {
          if (!label.trim()) return;
          onChange([...options, { label: label.trim(), value: slugify(label), color: PALETTE[options.length % PALETTE.length] }]);
          setLabel("");
        }}>
          Add option
        </Button>
      </div>
    </div>
  );
}

function FieldDialog({ def, onClose }: { def?: Doc<"fieldDefinitions">; onClose: () => void }) {
  const create = useMutation(api.fields.create);
  const update = useMutation(api.fields.update);
  const [label, setLabel] = useState(def?.label ?? "");
  const [type, setType] = useState<FieldType>(def?.type ?? "text");
  const [required, setRequired] = useState(def?.required ?? false);
  const [showInTable, setShowInTable] = useState(def?.showInTable ?? true);
  const [options, setOptions] = useState<Opt[]>(def?.options ?? []);
  const isSelect = type === "single_select" || type === "multi_select";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = z.string().trim().min(1, "Label is required").max(60).safeParse(label);
    if (!p.success) return toast.error(p.error.issues[0].message);
    const ok = def
      ? await attempt(update({ id: def._id, label: p.data, required, showInTable, options: isSelect ? options : undefined }), "Field updated")
      : await attempt(create({ label: p.data, type, required, showInTable, options: isSelect ? options : undefined }), "Field created");
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={def ? `Edit ${def.label}` : "New field"} description={def ? `Key “${def.key}” and type can’t change after creation.` : "The key is generated from the label and can’t change later."} className="max-w-xl">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fd-label">Label</Label>
              <Input id="fd-label" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
              {!def && label ? <p className="caption mt-1">Key: {slugify(label)}</p> : null}
            </div>
            <div>
              <Label htmlFor="fd-type">Type</Label>
              <NativeSelect id="fd-type" value={type} disabled={!!def} onChange={(e) => setType(e.target.value as FieldType)}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={required} disabled={def?.key === "name"} onCheckedChange={(c) => setRequired(!!c)} /> Required
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={showInTable} onCheckedChange={(c) => setShowInTable(!!c)} /> Show in table by default
          </label>
          {isSelect ? (
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-fg-secondary">Options</div>
              <OptionsEditor options={options} onChange={setOptions} />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {def ? "Save" : "Create field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldsTab() {
  const all = useQuery(api.fields.list, { includeArchived: true });
  const reorder = useMutation(api.fields.reorder);
  const setArchived = useMutation(api.fields.setArchived);
  const [editing, setEditing] = useState<Doc<"fieldDefinitions"> | "new" | null>(null);
  const active = all?.filter((f) => !f.archived) ?? [];
  const archived = all?.filter((f) => f.archived) ?? [];
  const { props, move } = useDragList(active, (ids) => attempt(reorder({ ids: ids as Id<"fieldDefinitions">[] }), "Order saved"));
  if (!all) return <Skeleton className="h-64 rounded-[12px]" />;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <p className="caption">Drag to reorder. Archiving hides a field; existing values are kept.</p>
        <Button variant="primary" onClick={() => setEditing("new")}>
          <Plus /> New field
        </Button>
      </div>
      <ul className="card divide-y divide-[var(--surface-muted)]">
        {active.map((f, i) => {
          const p = props(f._id, i);
          return (
            <li key={f._id} {...p} className={cn("flex flex-wrap items-center gap-3 px-3 py-2.5", p.className)}>
              <GripVertical className="size-4 cursor-grab text-fg-muted" aria-hidden />
              <div className="min-w-[160px] flex-1">
                <div className="text-[13px] font-medium">
                  {f.label} {f.required ? <span className="text-danger">*</span> : null}
                </div>
                <div className="caption">
                  {f.key} · {FIELD_TYPES.find((t) => t.value === f.type)?.label}
                  {f.showInTable ? " · in table" : ""}
                </div>
              </div>
              {f.options?.length ? (
                <div className="hidden gap-1 lg:flex">
                  {f.options.slice(0, 4).map((o) => (
                    <Pill key={o.value} color={o.color}>
                      {o.label}
                    </Pill>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={`Move ${f.label} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <ArrowUp />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Move ${f.label} down`} disabled={i === active.length - 1} onClick={() => move(i, i + 1)}>
                  <ArrowDown />
                </Button>
                <Button size="sm" onClick={() => setEditing(f)}>
                  Edit
                </Button>
                {f.key !== "name" ? (
                  <Button size="icon-sm" variant="ghost" aria-label={`Archive ${f.label}`} title="Archive" onClick={() => attempt(setArchived({ id: f._id, archived: true }), `${f.label} archived`)}>
                    <Archive />
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {archived.length ? (
        <>
          <h3 className="mb-2 mt-6 text-[13px] font-semibold text-fg-muted">Archived</h3>
          <ul className="card divide-y divide-[var(--surface-muted)]">
            {archived.map((f) => (
              <li key={f._id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 text-[13px] text-fg-muted">
                  {f.label} <span className="caption">· {f.key}</span>
                </div>
                <Button size="sm" onClick={() => attempt(setArchived({ id: f._id, archived: false }), `${f.label} restored`)}>
                  <ArchiveRestore /> Restore
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {editing ? <FieldDialog def={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

function StatusRow({ s }: { s: Doc<"statuses"> }) {
  const update = useMutation(api.statuses.update);
  const [name, setName] = useState(s.name);
  useEffect(() => setName(s.name), [s.name]);
  return (
    <>
      <Input aria-label="Status name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== s.name && attempt(update({ id: s._id, name }), "Status renamed")} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className="h-7 w-44" />
      <ColorPicker label={`Color for ${s.name}`} value={s.color} onChange={(c) => attempt(update({ id: s._id, color: c }), "Color updated")} />
      <NativeSelect aria-label="Kind" value={s.kind} disabled={!!s.key} className="h-7 w-24" onChange={(e) => attempt(update({ id: s._id, kind: e.target.value as Doc<"statuses">["kind"] }), "Kind updated")}>
        <option value="open">Open</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
      </NativeSelect>
    </>
  );
}

function StatusesTab() {
  const { statuses } = useApp();
  const reorder = useMutation(api.statuses.reorder);
  const create = useMutation(api.statuses.create);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[8]);
  const [kind, setKind] = useState<Doc<"statuses">["kind"]>("open");
  const { props, move } = useDragList(statuses, (ids) => attempt(reorder({ ids: ids as Id<"statuses">[] }), "Order saved"));
  return (
    <section>
      <p className="caption mb-3">Order sets the pipeline and funnel. Built-in statuses drive the meeting and Won flows, so their kind is fixed (rename them freely).</p>
      <ul className="card divide-y divide-[var(--surface-muted)]">
        {statuses.map((s, i) => {
          const p = props(s._id, i);
          return (
            <li key={s._id} {...p} className={cn("flex flex-wrap items-center gap-3 px-3 py-2.5", p.className)}>
              <GripVertical className="size-4 cursor-grab text-fg-muted" aria-hidden />
              <Pill color={s.color} className="w-36 justify-center">
                {s.name}
              </Pill>
              <StatusRow s={s} />
              <div className="ml-auto flex gap-1">
                <Button size="icon-sm" variant="ghost" aria-label={`Move ${s.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <ArrowUp />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Move ${s.name} down`} disabled={i === statuses.length - 1} onClick={() => move(i, i + 1)}>
                  <ArrowDown />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <form
        className="card mt-4 flex flex-wrap items-end gap-3 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return toast.error("Name the status");
          if (await attempt(create({ name, color, kind }), "Status added")) setName("");
        }}
      >
        <div>
          <Label htmlFor="ns-name">New status</Label>
          <Input id="ns-name" value={name} onChange={(e) => setName(e.target.value)} className="w-44" maxLength={40} />
        </div>
        <div>
          <Label>Color</Label>
          <ColorPicker label="New status color" value={color} onChange={setColor} />
        </div>
        <div>
          <Label htmlFor="ns-kind">Kind</Label>
          <NativeSelect id="ns-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-28">
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </NativeSelect>
        </div>
        <Button variant="primary" type="submit">
          <Plus /> Add status
        </Button>
      </form>
    </section>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

function GeneralTab() {
  const { settings } = useApp();
  const update = useMutation(api.settings.update);
  const [currency, setCurrency] = useState(settings.currency);
  const [rate, setRate] = useState(String(settings.defaultCommissionRate));
  return (
    <form
      className="card max-w-xl space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const r = z.coerce.number().min(0).max(100).safeParse(rate);
        if (!r.success) return toast.error("Rate must be between 0 and 100");
        attempt(update({ currency, defaultCommissionRate: r.data }), "Settings saved");
      }}
    >
      <div>
        <Label htmlFor="g-cur">Currency</Label>
        <NativeSelect id="g-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-56">
          {["INR", "USD", "AUD", "GBP", "EUR", "SGD", "AED"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
        <p className="caption mt-1">Existing commissions keep the currency they were created with.</p>
      </div>
      <div>
        <Label htmlFor="g-rate">Default commission rate (%)</Label>
        <Input id="g-rate" type="number" step="0.1" min="0" max="100" value={rate} onChange={(e) => setRate(e.target.value)} className="w-32" />
        <p className="caption mt-1">Per-member overrides live on the Team page. Changing this doesn’t alter past commissions.</p>
      </div>
      <Button variant="primary" type="submit">
        Save
      </Button>
    </form>
  );
}

function MeetingsTab() {
  const { settings } = useApp();
  const update = useMutation(api.settings.update);
  const [capacity, setCapacity] = useState(String(settings.slotCapacity));
  const [tz, setTz] = useState(settings.teamTimeZone);
  const [days, setDays] = useState(settings.workingHours.days);
  const [start, setStart] = useState(settings.workingHours.start);
  const [end, setEnd] = useState(settings.workingHours.end);
  const [blocked, setBlocked] = useState(settings.blockedDates);
  const [newDate, setNewDate] = useState("");
  return (
    <form
      className="card max-w-2xl space-y-5 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const c = z.coerce.number().int().min(1).max(20).safeParse(capacity);
        if (!c.success) return toast.error("Capacity must be a whole number from 1 to 20");
        if (start >= end) return toast.error("Working hours must end after they start");
        attempt(update({ slotCapacity: c.data, teamTimeZone: tz, workingHours: { days: [...days].sort(), start, end }, blockedDates: [...blocked].sort() }), "Meeting rules saved");
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="m-cap">Meetings per slot</Label>
          <Input id="m-cap" type="number" min="1" max="20" value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-24" />
          <p className="caption mt-1">How many requested/scheduled meetings may share one slot.</p>
        </div>
        <div>
          <Label>Slot length</Label>
          {/* DECISION: slot length is fixed at 30 min (spec); shown read-only. */}
          <div className="flex h-8 items-center text-[13px]">{settings.slotMinutes} minutes</div>
        </div>
      </div>
      <div>
        <Label htmlFor="m-tz">Team time zone</Label>
        <TimezoneSelect id="m-tz" value={tz} onChange={setTz} />
      </div>
      <fieldset>
        <legend className="mb-1 text-[12px] font-medium text-fg-secondary">Working days</legend>
        <div className="flex flex-wrap gap-3">
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1.5 text-[13px]">
              <Checkbox checked={days.includes(i)} onCheckedChange={(c) => setDays(c ? [...days, i] : days.filter((x) => x !== i))} /> {d}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-4">
        <div>
          <Label htmlFor="m-start">Start</Label>
          <NativeSelect id="m-start" value={start} onChange={(e) => setStart(e.target.value)} className="w-28">
            {TIMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="m-end">End</Label>
          <NativeSelect id="m-end" value={end} onChange={(e) => setEnd(e.target.value)} className="w-28">
            {TIMES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div>
        <Label htmlFor="m-blocked">Blocked dates</Label>
        <div className="flex gap-2">
          <Input id="m-blocked" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-44" />
          <Button
            type="button"
            onClick={() => {
              if (newDate && !blocked.includes(newDate)) setBlocked([...blocked, newDate]);
              setNewDate("");
            }}
          >
            Block date
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {blocked.length === 0 ? <span className="caption">None</span> : null}
          {[...blocked].sort().map((d) => (
            <span key={d} className="num inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[12px]">
              {d}
              <button type="button" aria-label={`Unblock ${d}`} onClick={() => setBlocked(blocked.filter((x) => x !== d))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
      <Button variant="primary" type="submit">
        Save meeting rules
      </Button>
    </form>
  );
}

export function SettingsPage() {
  const [tab, setTab] = useLocalState<Tab>("settings.tab", "fields");
  const tabs: { id: Tab; label: string }[] = [
    { id: "fields", label: "Lead fields" },
    { id: "statuses", label: "Statuses" },
    { id: "meetings", label: "Meetings" },
    { id: "general", label: "Commission & currency" },
  ];
  return (
    <Page>
      <PageHeader title="Settings" subtitle="Workspace-wide configuration" />
      <div role="tablist" aria-label="Settings sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("-mb-px h-9 shrink-0 border-b-2 border-transparent px-3 text-[13px] font-medium text-fg-muted hover:text-fg", tab === t.id && "border-primary text-fg")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "fields" ? <FieldsTab /> : tab === "statuses" ? <StatusesTab /> : tab === "meetings" ? <MeetingsTab /> : <GeneralTab />}
    </Page>
  );
}
