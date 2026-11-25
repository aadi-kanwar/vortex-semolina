"use client";
import { useMemo, useState } from "react";
import { CalendarClock, Contact } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { leadTitle } from "@convex/lib/shared";
import { useApp } from "@/components/app-data";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton, Swatch } from "@/components/ui/misc";
import { useLeadPanel } from "@/hooks/use-lead-panel";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AssigneeControl } from "./assignee";
import { StatusMenu, useStatusChanger } from "./status-control";
import type { LeadRow } from "./leads-table";
import type { LeadListArgs } from "./use-lead-mutations";

const DND_TYPE = "application/x-vortex-lead";

interface Props {
  rows: LeadRow[];
  listArgs: LeadListArgs;
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: () => void;
  emptyAction?: React.ReactNode;
}

/**
 * Board view: one column per status. Drag a card to another column to change
 * its status (Won/Lost still ask for amount / reason). Counts are of the
 * leads loaded so far; "Load more" pulls the next page.
 */
export function LeadsBoard({ rows, listArgs, status, loadMore, emptyAction }: Props) {
  const { statuses, isAdmin, me } = useApp();
  const { change, dialogs } = useStatusChanger(listArgs);
  const { open } = useLeadPanel();
  const [dragging, setDragging] = useState<LeadRow | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const byStatus = useMemo(() => {
    const m = new Map<string, LeadRow[]>();
    for (const r of rows) m.set(r.statusId, [...(m.get(r.statusId) ?? []), r]);
    return m;
  }, [rows]);
  const canEdit = (l: LeadRow) => isAdmin || l.assignedTo === me._id;

  if (status === "LoadingFirstPage") {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[420px] w-[272px] shrink-0 rounded-[12px]" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={<Contact />} title="No leads here" hint="Try another view or clear the filters." action={emptyAction} />
      </div>
    );
  }

  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-3 md:-mx-8 md:px-8">
        <div className="flex min-h-[calc(100dvh-300px)] gap-3">
          {statuses.map((s) => {
            const items = byStatus.get(s._id) ?? [];
            const isOver = over === s._id && (!dragging || dragging.statusId !== s._id);
            return (
              <section
                key={s._id}
                aria-label={`${s.name}, ${items.length} leads`}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DND_TYPE)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (over !== s._id) setOver(s._id);
                }}
                onDragLeave={() => setOver((o) => (o === s._id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData(DND_TYPE);
                  const lead = rows.find((r) => r._id === id) ?? dragging;
                  if (lead && lead.statusId !== s._id) change(lead._id, s._id as Id<"statuses">, lead.statusId);
                  setDragging(null);
                  setOver(null);
                }}
                className={cn(
                  "flex w-[272px] shrink-0 flex-col rounded-[12px] border border-border bg-surface-muted/60 transition-colors",
                  isOver && "border-primary bg-accent-soft/60",
                )}
              >
                <header className="flex items-center gap-2 px-3 pb-2 pt-3">
                  <Swatch color={s.color} />
                  <h3 className="truncate text-[14px] font-semibold">{s.name}</h3>
                  <span className="num ml-auto rounded-full bg-surface px-2 text-[12px] font-medium text-fg-muted">{items.length}</span>
                </header>
                <ul className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {items.map((l) => {
                    const editable = canEdit(l);
                    const due = l.nextFollowUpAt && l.nextFollowUpAt <= Date.now() + 86400000;
                    return (
                      <li
                        key={l._id}
                        draggable={editable}
                        onDragStart={(e) => {
                          setDragging(l);
                          e.dataTransfer.setData(DND_TYPE, l._id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                        className={cn(
                          "group rounded-[10px] border border-border bg-surface p-3 shadow-none transition-opacity",
                          editable && "cursor-grab active:cursor-grabbing",
                          dragging?._id === l._id && "opacity-40",
                        )}
                      >
                        {/* A div (not <button>) so a drag can start on the text too. */}
                        <div
                          role="button"
                          tabIndex={0}
                          className="block w-full cursor-pointer rounded-[6px] text-left focus-visible:outline-2 focus-visible:outline-primary"
                          onClick={() => open(l._id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              open(l._id);
                            }
                          }}
                        >
                          <div className="truncate text-[14px] font-medium">{leadTitle(l.fields)}</div>
                          {l.fields.company || l.fields.country ? (
                            <div className="caption truncate">{[l.fields.company, l.fields.country].filter(Boolean).join(" · ")}</div>
                          ) : null}
                        </div>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <AssigneeControl leadId={l._id} assignedTo={l.assignedTo} />
                          {l.nextFollowUpAt ? (
                            <span className={cn("caption num flex shrink-0 items-center gap-1", due && "font-medium text-danger")}>
                              <CalendarClock className="size-3.5" />
                              {new Date(l.nextFollowUpAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                          ) : (
                            <span className="caption shrink-0">{relative(l.lastActivityAt)}</span>
                          )}
                        </div>
                        {/* Keyboard / touch alternative to dragging. */}
                        {editable ? (
                          <div className="mt-2 hidden group-focus-within:block group-hover:block">
                            <StatusMenu statusId={l.statusId} onChange={(st) => change(l._id, st, l.statusId)} />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                  {items.length === 0 ? <li className="caption rounded-[10px] border border-dashed border-border px-3 py-6 text-center">{dragging ? "Drop here" : "No leads"}</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
      <div className="caption mt-2 flex items-center justify-between">
        <span className="num">
          {rows.length.toLocaleString("en-IN")} leads loaded{status === "Exhausted" ? " · all shown" : ""} · drag a card to change its status
        </span>
        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <Button size="sm" variant="ghost" disabled={status === "LoadingMore"} onClick={loadMore}>
            Load more
          </Button>
        ) : null}
      </div>
      {dialogs}
    </>
  );
}
