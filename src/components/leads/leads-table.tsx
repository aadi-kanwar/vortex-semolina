"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import { toast } from "sonner";
import { Contact } from "lucide-react";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { leadTitle } from "@convex/lib/shared";
import { useApp } from "@/components/app-data";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useLeadPanel } from "@/hooks/use-lead-panel";
import { useLocalState } from "@/hooks/use-local-state";
import { relative } from "@/lib/format";
import { cn, errorMessage } from "@/lib/utils";
import { AssigneeControl } from "./assignee";
import { FieldDisplay, FieldEditor } from "./field-value";
import { StatusMenu, useStatusChanger } from "./status-control";
import { useLeadMutations, type LeadListArgs } from "./use-lead-mutations";

export type LeadRow = Omit<Doc<"leads">, "searchText" | "emailKey" | "phoneKey">;

interface Props {
  rows: LeadRow[];
  listArgs: LeadListArgs;
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: () => void;
  selection: RowSelectionState;
  onSelectionChange: (s: RowSelectionState) => void;
  emptyAction?: React.ReactNode;
  columnsMenuRef?: React.MutableRefObject<ColumnsApi | null>;
}

export interface ColumnsApi {
  columns: { id: string; label: string; visible: boolean }[];
  toggle: (id: string, v: boolean) => void;
  reset: () => void;
}

const SYSTEM_LABELS: Record<string, string> = { status: "Status", assignee: "Assigned to", followup: "Follow-up", activity: "Last activity", created: "Created" };

/** Editable cell for a custom field; arrow keys move between cells, Enter edits. */
function FieldCell({ def, lead, canEdit, listArgs }: { def: Doc<"fieldDefinitions">; lead: LeadRow; canEdit: boolean; listArgs: LeadListArgs }) {
  const { settings } = useApp();
  const { updateField } = useLeadMutations(listArgs);
  const [editing, setEditing] = useState(false);
  const value = lead.fields[def.key];
  const save = async (v: unknown) => {
    setEditing(false);
    if (JSON.stringify(v ?? null) === JSON.stringify(value ?? null)) return;
    try {
      await updateField({ id: lead._id, key: def.key, value: v ?? "" });
      toast.success(`${def.label} updated`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  if (def.type === "checkbox") {
    return <Checkbox checked={!!value} disabled={!canEdit} onCheckedChange={(c) => save(!!c)} aria-label={def.label} onClick={(e) => e.stopPropagation()} />;
  }
  if (editing) {
    return (
      <div className="relative -mx-1 w-full" onClick={(e) => e.stopPropagation()}>
        <FieldEditor def={def} value={value} onCommit={save} onCancel={() => setEditing(false)} className={def.type === "long_text" ? "absolute left-0 top-0 z-20 w-[280px]" : ""} />
        {def.type === "single_select" || def.type === "multi_select" ? <FieldDisplay def={def} value={value} currency={settings.currency} /> : null}
      </div>
    );
  }
  return (
    <div
      data-editable={canEdit ? "true" : undefined}
      className={cn("flex h-10 w-full min-w-0 items-center", canEdit && "cursor-text")}
      onDoubleClick={() => canEdit && setEditing(true)}
      onKeyDown={(e) => {
        if (canEdit && (e.key === "Enter" || e.key === "F2")) {
          e.preventDefault();
          setEditing(true);
        }
      }}
      onClick={(e) => {
        if (canEdit) {
          e.stopPropagation();
          setEditing(true);
        }
      }}
    >
      <FieldDisplay def={def} value={value} currency={settings.currency} />
    </div>
  );
}

function focusCell(table: HTMLTableElement | null, r: number, c: number) {
  const el = table?.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`);
  el?.focus();
}

export function LeadsTable({ rows, listArgs, status, loadMore, selection, onSelectionChange, emptyAction, columnsMenuRef }: Props) {
  const app = useApp();
  const { fields, isAdmin, me } = app;
  const { open } = useLeadPanel();
  const { change, dialogs } = useStatusChanger(listArgs);
  const tableRef = useRef<HTMLTableElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const nameDef = fields.find((f) => f.key === "name");
  const otherDefs = fields.filter((f) => f.key !== "name");
  const defaultVisibility = useMemo<VisibilityState>(() => Object.fromEntries(otherDefs.map((f) => [`f:${f.key}`, f.showInTable])), [otherDefs]);
  const [visibility, setVisibility] = useLocalState<VisibilityState>(`leads.cols.vis.${me._id}`, {});
  const [order, setOrder] = useLocalState<ColumnOrderState>(`leads.cols.order.${me._id}`, []);
  const [sizing, setSizing] = useLocalState<ColumnSizingState>(`leads.cols.size.${me._id}`, {});
  const [dragCol, setDragCol] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<LeadRow>[]>(() => {
    const canEdit = (l: LeadRow) => isAdmin || l.assignedTo === me._id;
    const cols: ColumnDef<LeadRow>[] = [];
    if (isAdmin) {
      cols.push({
        id: "select",
        size: 40,
        enableResizing: false,
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all loaded rows"
            checked={table.getIsAllRowsSelected() ? true : table.getIsSomeRowsSelected() ? "indeterminate" : false}
            onCheckedChange={(c) => table.toggleAllRowsSelected(!!c)}
          />
        ),
        cell: ({ row }) => <Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(c) => row.toggleSelected(!!c)} onClick={(e) => e.stopPropagation()} />,
      });
    }
    cols.push({
      id: "name",
      header: nameDef?.label ?? "Name",
      size: 220,
      cell: ({ row }) => (
        <button className="truncate text-left font-medium text-fg hover:underline" onClick={() => open(row.original._id)}>
          {leadTitle(row.original.fields)}
        </button>
      ),
    });
    cols.push({
      id: "status",
      header: "Status",
      size: 160,
      cell: ({ row }) => <StatusMenu statusId={row.original.statusId} disabled={!canEdit(row.original)} onChange={(s) => change(row.original._id, s)} />,
    });
    cols.push({ id: "assignee", header: "Assigned to", size: 160, cell: ({ row }) => <AssigneeControl leadId={row.original._id} assignedTo={row.original.assignedTo} /> });
    for (const def of otherDefs) {
      cols.push({
        id: `f:${def.key}`,
        header: def.label,
        size: def.type === "long_text" ? 240 : def.type === "checkbox" ? 90 : 160,
        cell: ({ row }) => <FieldCell def={def} lead={row.original} canEdit={canEdit(row.original)} listArgs={listArgs} />,
      });
    }
    cols.push({
      id: "followup",
      header: "Follow-up",
      size: 120,
      cell: ({ row }) => {
        const t = row.original.nextFollowUpAt;
        if (!t) return <span className="text-fg-muted">—</span>;
        const due = t <= Date.now() + 86400000;
        return <span className={cn("num", due && "font-medium text-danger")}>{new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>;
      },
    });
    cols.push({ id: "activity", header: "Last activity", size: 130, cell: ({ row }) => <span className="text-fg-muted">{relative(row.original.lastActivityAt)}</span> });
    cols.push({ id: "created", header: "Created", size: 110, cell: ({ row }) => <span className="num text-fg-muted">{new Date(row.original.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span> });
    return cols;
  }, [isAdmin, me._id, nameDef, otherDefs, open, change, listArgs]);

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (r) => r._id,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    enableRowSelection: isAdmin,
    state: { rowSelection: selection, columnVisibility: { ...defaultVisibility, ...visibility }, columnOrder: order, columnSizing: sizing },
    onRowSelectionChange: (u) => onSelectionChange(typeof u === "function" ? u(selection) : u),
    onColumnVisibilityChange: (u) => setVisibility((p) => (typeof u === "function" ? u({ ...defaultVisibility, ...p }) : u)),
    onColumnOrderChange: (u) => setOrder((p) => (typeof u === "function" ? u(p) : u)),
    onColumnSizingChange: (u) => setSizing((p) => (typeof u === "function" ? u(p) : u)),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  // Expose column toggles to the toolbar's "Columns" menu.
  if (columnsMenuRef) {
    columnsMenuRef.current = {
      columns: table
        .getAllLeafColumns()
        .filter((c) => c.id !== "select" && c.id !== "name")
        .map((c) => ({ id: c.id, label: SYSTEM_LABELS[c.id] ?? (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id), visible: c.getIsVisible() })),
      toggle: (id, v) => table.getColumn(id)?.toggleVisibility(v),
      reset: () => {
        setVisibility({});
        setOrder([]);
        setSizing({});
      },
    };
  }

  // Infinite scroll: load the next server page when the sentinel is visible.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && status === "CanLoadMore") loadMore();
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore]);

  const onDrop = (target: string) => {
    if (!dragCol || dragCol === target) return;
    const ids = table.getAllLeafColumns().map((c) => c.id);
    const current = order.length ? [...order, ...ids.filter((i) => !order.includes(i))] : ids;
    const from = current.indexOf(dragCol);
    const to = current.indexOf(target);
    current.splice(to, 0, current.splice(from, 1)[0]);
    setOrder(current);
    setDragCol(null);
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
    const cell = t.closest<HTMLElement>("[data-r]");
    if (!cell) return;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const moves: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      focusCell(tableRef.current, r + m[0], c + m[1]);
    } else if (e.key === "Enter" && t === cell) {
      const inner = cell.querySelector<HTMLElement>("[data-editable], button, [role=checkbox]");
      if (inner?.dataset.editable) inner.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      else inner?.click();
    }
  };

  if (status === "LoadingFirstPage") {
    return (
      <div className="card overflow-hidden">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-border px-4 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={<Contact />} title="No leads here" hint="Try another view or clear the filters. New leads and imports show up instantly." action={emptyAction} />
      </div>
    );
  }

  const visibleCols = table.getVisibleLeafColumns();
  return (
    <>
      {/* Desktop grid */}
      <div className="card hidden overflow-hidden md:block">
        <div className="max-h-[calc(100dvh-260px)] overflow-auto">
          <table ref={tableRef} role="grid" aria-rowcount={rows.length} className="w-full border-separate border-spacing-0 text-[14px]" style={{ width: table.getTotalSize(), minWidth: "100%" }} onKeyDown={onGridKey}>
            <thead className="sticky top-0 z-10 bg-surface">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      scope="col"
                      style={{ width: h.getSize() }}
                      draggable={h.id !== "select"}
                      onDragStart={() => setDragCol(h.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(h.id)}
                      className={cn("group relative h-9 select-none border-b border-border px-3 text-left text-[13px] font-medium text-fg-muted", dragCol === h.id && "opacity-50")}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getCanResize() ? (
                        <div
                          role="separator"
                          aria-label={`Resize ${String(h.column.columnDef.header)}`}
                          onMouseDown={h.getResizeHandler()}
                          onTouchStart={h.getResizeHandler()}
                          onDoubleClick={() => h.column.resetSize()}
                          className={cn("absolute right-0 top-0 h-full w-1 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-primary", h.column.getIsResizing() && "bg-primary opacity-100")}
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, ri) => (
                <tr key={row.id} aria-selected={row.getIsSelected()} className={cn("hover:bg-surface-muted/60", row.getIsSelected() && "bg-accent-soft/50")}>
                  {row.getVisibleCells().map((cell, ci) => (
                    <td
                      key={cell.id}
                      data-r={ri}
                      data-c={ci}
                      tabIndex={ri === 0 && ci === 0 ? 0 : -1}
                      style={{ width: cell.column.getSize(), maxWidth: cell.column.getSize() }}
                      className="h-10 overflow-hidden border-b border-[var(--surface-muted)] px-3 focus:bg-accent-soft/40 focus:outline-2 focus:-outline-offset-2 focus:outline-primary"
                    >
                      <div className="flex w-full min-w-0 items-center overflow-hidden">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div ref={sentinel} className="h-1" />
          {status === "LoadingMore" ? (
            <div className="flex gap-4 px-4 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ) : null}
        </div>
        <div className="caption flex items-center justify-between border-t border-border px-4 py-2">
          <span className="num">
            {rows.length.toLocaleString("en-IN")} loaded {status === "Exhausted" ? "· end of list" : ""} · {visibleCols.length} columns
          </span>
          {status === "CanLoadMore" ? (
            <Button size="sm" variant="ghost" onClick={loadMore}>
              Load more
            </Button>
          ) : null}
        </div>
      </div>

      {/* Mobile card list */}
      <ul className="space-y-2 md:hidden">
        {rows.map((l) => (
          <li key={l._id} className="card p-3">
            <div className="flex items-start justify-between gap-2">
              <button className="min-w-0 text-left" onClick={() => open(l._id)}>
                <div className="truncate font-medium">{leadTitle(l.fields)}</div>
                <div className="caption truncate">{[l.fields.company, l.fields.country].filter(Boolean).join(" · ")}</div>
              </button>
              <StatusMenu statusId={l.statusId} disabled={!(isAdmin || l.assignedTo === me._id)} onChange={(s) => change(l._id, s)} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <AssigneeControl leadId={l._id} assignedTo={l.assignedTo} />
              <span className="caption">{relative(l.lastActivityAt)}</span>
            </div>
          </li>
        ))}
        {status === "CanLoadMore" ? (
          <li>
            <Button className="w-full" onClick={loadMore}>
              Load more
            </Button>
          </li>
        ) : null}
      </ul>
      {dialogs}
    </>
  );
}

export type { Id };
