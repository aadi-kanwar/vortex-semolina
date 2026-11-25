"use client";
import type { ConvexReactClient } from "convex/react";
import * as XLSX from "xlsx";
import { api } from "@convex/_generated/api";
import type { AppData } from "@/components/app-data";
import type { LeadListArgs } from "./use-lead-mutations";

/** Export the current view (same filters) by walking the paginated query. */
export async function exportLeads(client: ConvexReactClient, args: LeadListArgs, app: AppData, onProgress?: (n: number) => void) {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 500; guard++) {
    const res: { page: any[]; isDone: boolean; continueCursor: string } = await client.query(api.leads.list, { ...args, paginationOpts: { numItems: 500, cursor } });
    for (const l of res.page) {
      const r: Record<string, unknown> = {};
      for (const f of app.fields) {
        const v = l.fields[f.key];
        if (f.type === "single_select") r[f.label] = f.options?.find((o) => o.value === v)?.label ?? v ?? "";
        else if (f.type === "multi_select") r[f.label] = (Array.isArray(v) ? v : []).map((x: string) => f.options?.find((o) => o.value === x)?.label ?? x).join(", ");
        else if (f.type === "checkbox") r[f.label] = v ? "Yes" : "No";
        else r[f.label] = v ?? "";
      }
      r["Status"] = app.statusById.get(l.statusId)?.name ?? "";
      r["Assigned to"] = l.assignedTo ? app.userById.get(l.assignedTo)?.name ?? "" : "Unassigned";
      r["Sale amount"] = l.saleAmount ?? "";
      r["Next follow-up"] = l.nextFollowUpAt ? new Date(l.nextFollowUpAt).toISOString().slice(0, 10) : "";
      r["Last activity"] = new Date(l.lastActivityAt).toISOString();
      r["Created"] = new Date(l.createdAt).toISOString();
      rows.push(r);
    }
    onProgress?.(rows.length);
    if (res.isDone) break;
    cursor = res.continueCursor;
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  XLSX.writeFile(wb, `leads-${args.view}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return rows.length;
}
