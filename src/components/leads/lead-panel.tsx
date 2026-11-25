"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import * as D from "@radix-ui/react-dialog";
import { CalendarClock, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { leadTitle } from "@convex/lib/shared";
import { useApp } from "@/components/app-data";
import { MeetingSection } from "@/components/calendar/meeting-section";
import { Button } from "@/components/ui/button";
import { SheetContent } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Checkbox } from "@/components/ui/checkbox";
import { useLeadPanel } from "@/hooks/use-lead-panel";
import { money, relative } from "@/lib/format";
import { errorMessage } from "@/lib/utils";
import { AssigneeControl } from "./assignee";
import { FieldDisplay, FieldEditor } from "./field-value";
import { StatusMenu, useStatusChanger } from "./status-control";
import { Timeline } from "./timeline";
import { useLeadMutations } from "./use-lead-mutations";

const toDateInput = (ms?: number) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : "");
const fromDateInput = (s: string) => (s ? new Date(s + "T09:00:00").getTime() : undefined);

function FieldRow({ def, lead, canEdit }: { def: Doc<"fieldDefinitions">; lead: Doc<"leads">; canEdit: boolean }) {
  const { settings } = useApp();
  const { updateField } = useLeadMutations();
  const [editing, setEditing] = useState(false);
  const value = lead.fields[def.key];
  const save = async (v: unknown) => {
    setEditing(false);
    if (JSON.stringify(v ?? null) === JSON.stringify(value ?? null)) return;
    try {
      await updateField({ id: lead._id, key: def.key, value: v ?? "" });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-2 py-1">
      <dt className="pt-1.5 text-[12px] text-fg-muted">
        {def.label}
        {def.required ? <span className="text-danger"> *</span> : null}
      </dt>
      <dd className="min-h-8 min-w-0">
        {def.type === "checkbox" ? (
          <label className="flex h-8 items-center gap-2">
            <Checkbox checked={!!value} disabled={!canEdit} onCheckedChange={(c) => save(!!c)} aria-label={def.label} />
          </label>
        ) : editing ? (
          <div className="relative">
            <FieldEditor def={def} value={value} onCommit={save} onCancel={() => setEditing(false)} />
            {(def.type === "single_select" || def.type === "multi_select") && (
              <div className="flex h-8 items-center px-2 text-[13px]">
                <FieldDisplay def={def} value={value} currency={settings.currency} />
              </div>
            )}
          </div>
        ) : (
          <button
            disabled={!canEdit}
            onClick={() => setEditing(true)}
            className="flex min-h-8 w-full items-center rounded-[6px] px-2 text-left text-[13px] hover:bg-surface-muted disabled:hover:bg-transparent"
            aria-label={`Edit ${def.label}`}
          >
            <FieldDisplay def={def} value={value} currency={settings.currency} />
          </button>
        )}
      </dd>
    </div>
  );
}

function NoteBox({ lead }: { lead: Doc<"leads"> }) {
  const addNote = useMutation(api.leads.addNote);
  const [text, setText] = useState("");
  const [follow, setFollow] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        try {
          await addNote({ id: lead._id, text, followUpAt: fromDateInput(follow) });
          setText("");
          setFollow("");
          toast.success("Note added");
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Textarea aria-label="Add a note" placeholder="Add a note…" value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.currentTarget.form as HTMLFormElement).requestSubmit(); }} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12px] text-fg-muted">
          <CalendarClock className="size-4" /> Follow-up
          <Input type="date" value={follow} onChange={(e) => setFollow(e.target.value)} className="h-7 w-[140px]" aria-label="Set follow-up date" />
        </label>
        <Button type="submit" variant="primary" size="sm" className="ml-auto" disabled={busy || !text.trim()}>
          Add note
        </Button>
      </div>
    </form>
  );
}

function PanelBody({ lead }: { lead: Doc<"leads"> }) {
  const { fields, isAdmin, me, settings, statusById } = useApp();
  const canEdit = isAdmin || lead.assignedTo === me._id;
  const { change, dialogs } = useStatusChanger();
  const setFollowUp = useMutation(api.leads.setFollowUp);
  const status = statusById.get(lead.statusId);
  return (
    <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1fr_380px] lg:overflow-hidden">
      <div className="space-y-4 p-5 lg:overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          <StatusMenu statusId={lead.statusId} onChange={(s) => change(lead._id, s)} disabled={!canEdit} />
          <AssigneeControl leadId={lead._id} assignedTo={lead.assignedTo} />
        </div>
        {!canEdit ? <p className="rounded-[8px] border border-warning-border bg-warning-bg px-3 py-2 text-[12px] text-warning-fg">Claim this lead to edit it.</p> : null}
        <dl className="grid grid-cols-[120px_1fr] gap-2 border-b border-border pb-3">
          <dt className="pt-1.5 text-[12px] text-fg-muted">Follow-up</dt>
          <dd>
            <Input
              type="date"
              className="h-8 w-[160px]"
              disabled={!canEdit}
              aria-label="Next follow-up date"
              value={toDateInput(lead.nextFollowUpAt)}
              onChange={(e) => setFollowUp({ id: lead._id, at: fromDateInput(e.target.value) }).then(() => toast.success("Follow-up updated")).catch((err) => toast.error(errorMessage(err)))}
            />
          </dd>
          {status?.kind === "won" ? (
            <>
              <dt className="pt-1 text-[12px] text-fg-muted">Sale amount</dt>
              <dd className="num pt-1 text-[13px] font-semibold">{money(lead.saleAmount, settings.currency)}</dd>
            </>
          ) : null}
          {status?.kind === "lost" && lead.lostReason ? (
            <>
              <dt className="pt-1 text-[12px] text-fg-muted">Loss reason</dt>
              <dd className="pt-1 text-[13px]">{lead.lostReason}</dd>
            </>
          ) : null}
          <dt className="text-[12px] text-fg-muted">Created</dt>
          <dd className="caption">{new Date(lead.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</dd>
          <dt className="text-[12px] text-fg-muted">Last activity</dt>
          <dd className="caption">{relative(lead.lastActivityAt)}</dd>
        </dl>
        <dl>
          {fields.map((d) => (
            <FieldRow key={d._id} def={d} lead={lead} canEdit={canEdit} />
          ))}
        </dl>
        <MeetingSection lead={lead} canEdit={canEdit} />
      </div>
      <aside className="space-y-4 border-t border-border bg-background p-5 lg:overflow-y-auto lg:border-l lg:border-t-0" aria-label="Activity">
        <h3 className="text-[13px] font-semibold">Activity</h3>
        {canEdit ? <NoteBox lead={lead} /> : null}
        <Timeline leadId={lead._id} />
      </aside>
      {dialogs}
    </div>
  );
}

export function LeadPanel() {
  const { leadId, close } = useLeadPanel();
  const lead = useQuery(api.leads.get, leadId ? { id: leadId as Doc<"leads">["_id"] } : "skip");
  const title = lead ? leadTitle(lead.fields) : "Lead";
  return (
    <D.Root open={!!leadId} onOpenChange={(o) => !o && close()}>
      <SheetContent title={title}>
        <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0 flex-1">
            {lead === undefined ? (
              <Skeleton className="h-5 w-48" />
            ) : (
              <>
                <h2 className="truncate text-[17px] font-semibold">{title}</h2>
                {lead?.fields.company ? <p className="caption truncate">{String(lead.fields.company)}</p> : null}
              </>
            )}
          </div>
          <D.Close className="grid size-8 place-items-center rounded-[8px] text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Close panel">
            <X className="size-4" />
          </D.Close>
        </header>
        {lead === undefined ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : lead === null ? (
          <p className="caption p-5">This lead doesn’t exist or isn’t visible to you.</p>
        ) : (
          <PanelBody lead={lead} />
        )}
      </SheetContent>
    </D.Root>
  );
}
