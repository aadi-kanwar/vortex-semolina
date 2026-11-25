"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useMutation, usePaginatedQuery } from "convex/react";
import type { RowSelectionState } from "@tanstack/react-table";
import { ArrowUpDown, Columns3, Download, Filter, Plus, Search, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useApp } from "@/components/app-data";
import { Page, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Avatar, Swatch } from "@/components/ui/misc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocalState } from "@/hooks/use-local-state";
import { cn, errorMessage } from "@/lib/utils";
import { exportLeads } from "./export";
import { ImportWizard } from "./import-wizard";
import { LeadsTable, type ColumnsApi } from "./leads-table";
import { NewLeadDialog } from "./new-lead-dialog";
import type { LeadListArgs } from "./use-lead-mutations";

type View = LeadListArgs["view"];
const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All leads" },
  { id: "mine", label: "My leads" },
  { id: "unassigned", label: "Unassigned" },
  { id: "meetings_requested", label: "Meetings requested" },
  { id: "won", label: "Won" },
];

type SortKey = `${"created" | "activity" | "followup"}:${"asc" | "desc"}`;
const SORTS: { id: SortKey; label: string }[] = [
  { id: "created:desc", label: "Newest first" },
  { id: "created:asc", label: "Oldest first" },
  { id: "activity:desc", label: "Recently active" },
  { id: "activity:asc", label: "Least recently active" },
  // DECISION: follow-up sort only lists leads that have a follow-up date (index range).
  { id: "followup:asc", label: "Follow-up date (soonest)" },
];
// DECISION: server-side sort is limited to indexed system fields so it stays fast at 10k+ leads.

interface Filters {
  statusIds: Id<"statuses">[];
  assignee?: string;
  fieldEquals: Record<string, string | boolean>;
  followUpDue: boolean;
}
const EMPTY: Filters = { statusIds: [], fieldEquals: {}, followUpDue: false };

function FilterPopover({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const { statuses, isAdmin, activeUsers, fields } = useApp();
  const selectable = fields.filter((f) => f.type === "single_select" || f.type === "checkbox");
  const count = filters.statusIds.length + (filters.assignee ? 1 : 0) + Object.keys(filters.fieldEquals).length + (filters.followUpDue ? 1 : 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="md" variant={count ? "soft" : "outline"}>
          <Filter /> Filter{count ? ` · ${count}` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3 p-3">
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-fg-secondary">Status</div>
          <div className="grid max-h-48 gap-1 overflow-y-auto">
            {statuses.map((s) => (
              <label key={s._id} className="flex items-center gap-2 rounded-[6px] px-1 py-0.5 text-[13px] hover:bg-surface-muted">
                <Checkbox
                  checked={filters.statusIds.includes(s._id)}
                  onCheckedChange={(c) => setFilters({ ...filters, statusIds: c ? [...filters.statusIds, s._id] : filters.statusIds.filter((x) => x !== s._id) })}
                />
                <Swatch color={s.color} /> {s.name}
              </label>
            ))}
          </div>
        </div>
        {isAdmin ? (
          <div>
            <Label htmlFor="f-assignee">Assigned to</Label>
            <NativeSelect id="f-assignee" value={filters.assignee ?? ""} onChange={(e) => setFilters({ ...filters, assignee: e.target.value || undefined })}>
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {activeUsers.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        {selectable.map((f) => (
          <div key={f._id}>
            <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
            <NativeSelect
              id={`f-${f.key}`}
              value={f.key in filters.fieldEquals ? String(filters.fieldEquals[f.key]) : ""}
              onChange={(e) => {
                const fe = { ...filters.fieldEquals };
                if (!e.target.value) delete fe[f.key];
                else fe[f.key] = f.type === "checkbox" ? e.target.value === "true" : e.target.value;
                setFilters({ ...filters, fieldEquals: fe });
              }}
            >
              <option value="">Any</option>
              {f.type === "checkbox" ? (
                <>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </>
              ) : (
                f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))
              )}
            </NativeSelect>
          </div>
        ))}
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox checked={filters.followUpDue} onCheckedChange={(c) => setFilters({ ...filters, followUpDue: !!c })} /> Follow-up due
        </label>
        {count ? (
          <Button size="sm" variant="ghost" className="w-full" onClick={() => setFilters(EMPTY)}>
            Clear filters
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function ColumnsMenu({ api: ref }: { api: React.MutableRefObject<ColumnsApi | null> }) {
  const [, force] = useState(0);
  const cols = ref.current?.columns ?? [];
  return (
    <DropdownMenu onOpenChange={() => force((x) => x + 1)}>
      <DropdownMenuTrigger asChild>
        <Button>
          <Columns3 /> <span className="hidden lg:inline">Columns</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[360px] overflow-y-auto">
        <DropdownMenuLabel>Show columns · drag headers to reorder</DropdownMenuLabel>
        {cols.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            checked={c.visible}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(v) => {
              ref.current?.toggle(c.id, !!v);
              setTimeout(() => force((x) => x + 1), 0);
            }}
          >
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => ref.current?.reset()}>Reset layout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkBar({ ids, clear }: { ids: Id<"leads">[]; clear: () => void }) {
  const { activeUsers, statuses } = useApp();
  const assign = useMutation(api.leads.assign);
  const bulkStatus = useMutation(api.leads.bulkSetStatus);
  const bulkDelete = useMutation(api.leads.bulkDelete);
  const [confirm, setConfirm] = useState<null | "delete" | { statusId: Id<"statuses">; name: string }>(null);
  const run = async (p: Promise<unknown>, msg: string) => {
    try {
      await p;
      toast.success(msg);
      clear();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <div className="card mb-3 flex flex-wrap items-center gap-2 px-3 py-2" role="region" aria-label="Bulk actions">
      <span className="num text-[13px] font-medium">{ids.length} selected</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">Assign to…</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {activeUsers.map((u) => (
            <DropdownMenuItem key={u._id} onSelect={() => run(assign({ ids, userId: u._id }), `Assigned ${ids.length} leads to ${u.name}`)}>
              <Avatar id={u._id} name={u.name} url={u.avatarUrl} size={18} /> {u.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" onClick={() => run(assign({ ids }), `Unassigned ${ids.length} leads`)}>
        Unassign
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">Change status</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {statuses
            .filter((s) => s.kind !== "won")
            .map((s) => (
              <DropdownMenuItem key={s._id} onSelect={() => setConfirm({ statusId: s._id, name: s.name })}>
                <Swatch color={s.color} /> {s.name}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="danger" onClick={() => setConfirm("delete")}>
        Delete
      </Button>
      <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={clear} aria-label="Clear selection">
        <X />
      </Button>
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        {confirm === "delete" ? (
          <DialogContent title={`Delete ${ids.length} leads?`} description="Their activity and meetings are deleted too. Pending commissions are voided. This can’t be undone.">
            <DialogFooter>
              <Button onClick={() => setConfirm(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => { setConfirm(null); run(bulkDelete({ ids }), `Deleted ${ids.length} leads`); }}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : confirm ? (
          <DialogContent title={`Move ${ids.length} leads to ${confirm.name}?`} description="Won leads moved out of Won have their pending commission voided.">
            <DialogFooter>
              <Button onClick={() => setConfirm(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => { const c = confirm; setConfirm(null); run(bulkStatus({ ids, statusId: c.statusId }), `Updated ${ids.length} leads`); }}>
                Change status
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

export function LeadsPage() {
  const app = useApp();
  const { isAdmin, me } = app;
  const convex = useConvex();
  const [view, setView] = useLocalState<View>(`leads.view.${me._id}`, "all");
  const [sort, setSort] = useLocalState<SortKey>(`leads.sort.${me._id}`, "created:desc");
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const columnsApi = useRef<ColumnsApi | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const [sortField, order] = sort.split(":") as ["created" | "activity" | "followup", "asc" | "desc"];
  const listArgs = useMemo<LeadListArgs>(
    () => ({
      view,
      search: search || undefined,
      statusIds: filters.statusIds.length ? filters.statusIds : undefined,
      assignee: filters.assignee,
      fieldEquals: Object.keys(filters.fieldEquals).length ? filters.fieldEquals : undefined,
      followUpDue: filters.followUpDue || undefined,
      sort: sortField,
      order,
    }),
    [view, search, filters, sortField, order],
  );
  const { results, status, loadMore } = usePaginatedQuery(api.leads.list, listArgs, { initialNumItems: 50 });
  useEffect(() => setSelection({}), [listArgs]);
  const selectedIds = Object.keys(selection).filter((k) => selection[k]) as Id<"leads">[];

  const doExport = async () => {
    setExporting(true);
    const t = toast.loading("Exporting…");
    try {
      const n = await exportLeads(convex, listArgs, app, (n) => toast.loading(`Exporting… ${n.toLocaleString("en-IN")} rows`, { id: t }));
      toast.success(`Exported ${n.toLocaleString("en-IN")} leads`, { id: t });
    } catch (e) {
      toast.error(errorMessage(e), { id: t });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Page>
      <PageHeader title="Leads" subtitle={isAdmin ? "Every lead on the team" : "Unassigned leads and yours"}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-fg-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads…" aria-label="Search leads" className="w-56 pl-8" />
        </div>
        <Button variant="primary" onClick={() => setNewOpen(true)}>
          <Plus /> New lead
        </Button>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Saved views" className="-mx-1 flex overflow-x-auto">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                "mx-0.5 h-8 shrink-0 rounded-[7px] px-3 text-[13px] font-medium text-fg-muted hover:bg-surface-muted hover:text-fg",
                view === v.id && "bg-accent-soft text-accent-soft-fg hover:bg-accent-soft hover:text-accent-soft-fg",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterPopover filters={filters} setFilters={setFilters} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <ArrowUpDown /> <span className="hidden lg:inline">Sort</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {search ? <DropdownMenuLabel>Search results are sorted by relevance</DropdownMenuLabel> : null}
              {SORTS.map((s) => (
                <DropdownMenuItem key={s.id} onSelect={() => setSort(s.id)}>
                  {s.label}
                  {sort === s.id ? <span className="ml-auto text-primary">✓</span> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <ColumnsMenu api={columnsApi} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={exporting}>
                <Download /> <span className="hidden lg:inline">Import / Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isAdmin ? (
                <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                  <Upload /> Import Excel / CSV…
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={doExport}>
                <Download /> Export this view (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isAdmin && selectedIds.length ? <BulkBar ids={selectedIds} clear={() => setSelection({})} /> : null}

      <LeadsTable
        rows={results}
        listArgs={listArgs}
        status={status}
        loadMore={() => loadMore(100)}
        selection={selection}
        onSelectionChange={setSelection}
        columnsMenuRef={columnsApi}
        emptyAction={
          isAdmin && view === "all" && !search ? (
            <Button variant="primary" onClick={() => setImportOpen(true)}>
              <Upload /> Import from Excel
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setNewOpen(true)}>
              <Plus /> New lead
            </Button>
          )
        }
      />
      <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} />
      {isAdmin ? <ImportWizard open={importOpen} onOpenChange={setImportOpen} /> : null}
    </Page>
  );
}

