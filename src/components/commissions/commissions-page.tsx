"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import * as XLSX from "xlsx";
import { Download, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useApp } from "@/components/app-data";
import { Page, PageHeader } from "@/components/shell/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Avatar, EmptyState, Pill, Skeleton } from "@/components/ui/misc";
import { useLeadPanel } from "@/hooks/use-lead-panel";
import { money } from "@/lib/format";
import { errorMessage } from "@/lib/utils";

const STATUS = { pending: { label: "Pending", color: "#F59E0B" }, paid: { label: "Paid", color: "#16A34A" }, void: { label: "Void", color: "#A1A1AA" } } as const;
const editSchema = z.object({ saleAmount: z.coerce.number().positive("Sale amount must be positive"), rate: z.coerce.number().min(0).max(100, "Rate must be 0–100") });

function EditDialog({ c, onClose }: { c: Doc<"commissions">; onClose: () => void }) {
  const update = useMutation(api.commissions.update);
  const [sale, setSale] = useState(String(c.saleAmount));
  const [rate, setRate] = useState(String(c.rate));
  const parsed = editSchema.safeParse({ saleAmount: sale, rate });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Edit commission · ${c.leadName}`} description="Changes are logged on the lead’s activity timeline.">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!parsed.success) return toast.error(parsed.error.issues[0].message);
            try {
              await update({ id: c._id, ...parsed.data });
              toast.success("Commission updated");
              onClose();
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="c-sale">Sale amount ({c.currency})</Label>
              <Input id="c-sale" type="number" value={sale} onChange={(e) => setSale(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="c-rate">Rate (%)</Label>
              <Input id="c-rate" type="number" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          </div>
          <p className="caption mt-3 num">Commission: {parsed.success ? money(Math.round(parsed.data.saleAmount * parsed.data.rate) / 100, c.currency) : "—"}</p>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!parsed.success}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CommissionsPage() {
  const { isAdmin, activeUsers, userById, settings } = useApp();
  const [status, setStatus] = useState<"" | "pending" | "paid" | "void">("");
  const [userId, setUserId] = useState("");
  const rows = useQuery(api.commissions.list, { status: status || undefined, userId: (userId || undefined) as Id<"users"> | undefined });
  const markPaid = useMutation(api.commissions.markPaid);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Doc<"commissions"> | null>(null);
  const { open } = useLeadPanel();

  const pendingRows = useMemo(() => rows?.filter((r) => r.status === "pending") ?? [], [rows]);
  const totals = useMemo(() => {
    const t = { pending: 0, paid: 0 };
    for (const r of rows ?? []) if (r.status === "pending") t.pending += r.amount;
    else if (r.status === "paid") t.paid += r.amount;
    return t;
  }, [rows]);

  const pay = async (ids: Id<"commissions">[]) => {
    try {
      const n = await markPaid({ ids });
      toast.success(`Marked ${n} commission${n === 1 ? "" : "s"} paid`);
      setSelected(new Set());
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const doExport = () => {
    const data = (rows ?? []).map((r) => ({
      Lead: r.leadName,
      Member: userById.get(r.userId)?.name ?? "",
      "Sale amount": r.saleAmount,
      "Rate %": r.rate,
      Commission: r.amount,
      Currency: r.currency,
      Status: STATUS[r.status].label,
      Created: new Date(r.createdAt).toISOString().slice(0, 10),
      "Paid on": r.paidAt ? new Date(r.paidAt).toISOString().slice(0, 10) : "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Commissions");
    XLSX.writeFile(wb, `commissions-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`Exported ${data.length} rows`);
  };

  return (
    <Page>
      <PageHeader title="Commissions" subtitle={isAdmin ? `Default rate ${settings.defaultCommissionRate}% · rate and amount are fixed when a deal is won` : "Your commission on won deals"}>
        <Button onClick={doExport} disabled={!rows?.length}>
          <Download /> Export
        </Button>
        {isAdmin ? (
          <Button variant="primary" disabled={!selected.size} onClick={() => pay([...selected] as Id<"commissions">[])}>
            Mark paid{selected.size ? ` (${selected.size})` : ""}
          </Button>
        ) : null}
      </PageHeader>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div className="card p-4">
          <div className="caption">Pending</div>
          <div className="kpi-number text-warning-fg">{money(totals.pending, settings.currency)}</div>
        </div>
        <div className="card p-4">
          <div className="caption">Paid</div>
          <div className="kpi-number">{money(totals.paid, settings.currency)}</div>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-40">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </NativeSelect>
        {isAdmin ? (
          <NativeSelect aria-label="Member" value={userId} onChange={(e) => setUserId(e.target.value)} className="w-48">
            <option value="">Everyone</option>
            {activeUsers.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      <div className="card overflow-hidden">
        {!rows ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Wallet />} title="No commissions yet" hint="A commission is created when a lead is marked Won with a sale amount." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead className="text-[13px] text-fg-muted">
                <tr className="border-b border-border">
                  {isAdmin ? (
                    <th className="w-10 px-3 py-2">
                      <Checkbox
                        aria-label="Select all pending"
                        checked={pendingRows.length > 0 && pendingRows.every((r) => selected.has(r._id)) ? true : selected.size ? "indeterminate" : false}
                        onCheckedChange={(c) => setSelected(c ? new Set(pendingRows.map((r) => r._id)) : new Set())}
                      />
                    </th>
                  ) : null}
                  <th className="px-3 py-2 text-left font-medium">Lead</th>
                  <th className="px-3 py-2 text-left font-medium">Member</th>
                  <th className="px-3 py-2 text-right font-medium">Sale</th>
                  <th className="px-3 py-2 text-right font-medium">Rate</th>
                  <th className="px-3 py-2 text-right font-medium">Commission</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Won</th>
                  <th className="px-3 py-2 text-left font-medium">Paid</th>
                  {isAdmin ? <th className="w-24 px-3 py-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = userById.get(r.userId);
                  return (
                    <tr key={r._id} className="border-b border-[var(--surface-muted)] last:border-0">
                      {isAdmin ? (
                        <td className="px-3 py-2">
                          <Checkbox
                            aria-label={`Select ${r.leadName}`}
                            disabled={r.status !== "pending"}
                            checked={selected.has(r._id)}
                            onCheckedChange={(c) => {
                              const s = new Set(selected);
                              if (c) s.add(r._id);
                              else s.delete(r._id);
                              setSelected(s);
                            }}
                          />
                        </td>
                      ) : null}
                      <td className="px-3 py-2">
                        <button className="font-medium hover:underline" onClick={() => open(r.leadId)}>
                          {r.leadName}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          <Avatar id={r.userId} name={u?.name} url={u?.avatarUrl} size={20} /> {u?.name}
                        </span>
                      </td>
                      <td className="num px-3 py-2 text-right">{money(r.saleAmount, r.currency)}</td>
                      <td className="num px-3 py-2 text-right">{r.rate}%</td>
                      <td className="num px-3 py-2 text-right font-semibold">{money(r.amount, r.currency)}</td>
                      <td className="px-3 py-2">
                        <Pill color={STATUS[r.status].color}>{STATUS[r.status].label}</Pill>
                      </td>
                      <td className="num px-3 py-2 text-fg-muted">{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                      <td className="num px-3 py-2 text-fg-muted">{r.paidAt ? new Date(r.paidAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</td>
                      {isAdmin ? (
                        <td className="px-3 py-2">
                          {r.status === "pending" ? (
                            <div className="flex justify-end gap-1">
                              <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(r)}>
                                <Pencil />
                              </Button>
                              <Button size="sm" onClick={() => pay([r._id])}>
                                Pay
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing ? <EditDialog c={editing} onClose={() => setEditing(null)} /> : null}
    </Page>
  );
}
