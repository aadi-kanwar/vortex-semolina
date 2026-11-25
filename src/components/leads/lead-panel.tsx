"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useLocalState } from "@/hooks/use-local-state";
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
import { cn, errorMessage } from "@/lib/utils";
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
      <dt className="pt-1.5 text-[13px] text-fg-muted">
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
              <div className="flex h-8 items-center px-2 text-[14px]">
                <FieldDisplay def={def} value={value} currency={settings.currency} />
              </div>
            )}
          </div>
        ) : (
          <button
            disabled={!canEdit}
            onClick={() => setEditing(true)}
            className="flex min-h-8 w-full items-center rounded-[6px] px-2 text-left text-[14px] hover:bg-surface-muted disabled:hover:bg-transparent"
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
        <label className="flex items-center gap-1.5 text-[13px] text-fg-muted">
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

type Tab = "details" | "activity" | "meeting";

function PanelBody({ lead }: { lead: Doc<"leads"> }) {
  const { fields, isAdmin, me, settings, statusById } = useApp();
  const canEdit = isAdmin || lead.assignedTo === me._id;
  const { change, dialogs } = useStatusChanger();
  const setFollowUp = useMutation(api.leads.setFollowUp);
  const status = statusById.get(lead.statusId);
  const [tab, setTab] = useLocalState<Tab>("leadPanel.tab", "details");
  const meetings = useQuery(api.meetings.forLead, { leadId: lead._id });
  const openMeeting = meetings?.find((m) => m.status === "requested" || m.status === "scheduled");
  const tabs: { id: Tab; label: string; badge?: React.ReactNode }[] = [
    { id: "details", label: "Details" },
    { id: "activity", label: "Activity" },
    {
      id: "meeting",
      label: "Meeting",
      badge: openMeeting ? (
        <span className={cn("size-1.5 rounded-full", openMeeting.status === "requested" ? "bg-warning-border" : "bg-primary")} aria-label={openMeeting.status === "requested" ? "needs Meet link" : "scheduled"} />
      ) : null,
    },
  ];
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === tab);
    if (e.key === "ArrowRight") setTab(tabs[(i + 1) % tabs.length].id);
    if (e.key === "ArrowLeft") setTab(tabs[(i + tabs.length - 1) % tabs.length].id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-border px-5 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusMenu statusId={lead.statusId} onChange={(s) => change(lead._id, s, lead.statusId)} disabled={!canEdit} />
          <AssigneeControl leadId={lead._id} assignedTo={lead.assignedTo} />
          {lead.nextFollowUpAt ? (
            <span className={cn("caption num ml-auto", lead.nextFollowUpAt <= Date.now() + 86400000 && "font-medium text-danger")}>
              Follow-up {new Date(lead.nextFollowUpAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          ) : null}
        </div>
        {!canEdit ? <p className="rounded-[8px] border border-warning-border bg-warning-bg px-3 py-2 text-[13px] text-warning-fg">Claim this lead to edit it.</p> : null}
        <div role="tablist" aria-label="Lead sections" className="-mb-px flex gap-1" onKeyDown={onTabKey}>
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`lp-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`lp-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[14px] font-medium text-fg-muted hover:text-fg",
                tab === t.id && "border-primary text-fg",
              )}
            >
              {t.label}
              {t.badge}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id={`lp-panel-${tab}`} aria-labelledby={`lp-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "details" ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-[120px_1fr] gap-2 border-b border-border pb-3">
              <dt className="pt-1.5 text-[13px] text-fg-muted">Follow-up</dt>
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
                  <dt className="pt-1 text-[13px] text-fg-muted">Sale amount</dt>
                  <dd className="num pt-1 text-[14px] font-semibold">{money(lead.saleAmount, settings.currency)}</dd>
                </>
              ) : null}
              {status?.kind === "lost" && lead.lostReason ? (
                <>
                  <dt className="pt-1 text-[13px] text-fg-muted">Loss reason</dt>
                  <dd className="pt-1 text-[14px]">{lead.lostReason}</dd>
                </>
              ) : null}
              <dt className="text-[13px] text-fg-muted">Created</dt>
              <dd className="caption">{new Date(lead.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</dd>
              <dt className="text-[13px] text-fg-muted">Last activity</dt>
              <dd className="caption">{relative(lead.lastActivityAt)}</dd>
            </dl>
            <dl>
              {fields.map((d) => (
                <FieldRow key={d._id} def={d} lead={lead} canEdit={canEdit} />
              ))}
            </dl>
          </div>
        ) : tab === "activity" ? (
          <div className="mx-auto max-w-2xl space-y-5">
            {canEdit ? <NoteBox lead={lead} /> : null}
            <Timeline leadId={lead._id} />
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <MeetingSection lead={lead} canEdit={canEdit} />
          </div>
        )}
      </div>
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
