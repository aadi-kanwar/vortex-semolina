import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { buildSearchText, normalizeEmail, normalizePhone, type FieldDefLike } from "./shared";

// Every lead write goes through these helpers so `counters`, `searchText`,
// dedupe keys and `lastActivityAt` never drift.

export const UNASSIGNED = "unassigned";
const aKey = (a?: Id<"users">) => a ?? UNASSIGNED;

export async function activeFieldDefs(ctx: QueryCtx | MutationCtx) {
  const defs = await ctx.db.query("fieldDefinitions").withIndex("by_order").collect();
  return defs.filter((d) => !d.archived);
}

async function counters(ctx: MutationCtx) {
  const c = await ctx.db.query("counters").first();
  if (c) return c;
  const id = await ctx.db.insert("counters", { total: 0, byStatus: {}, byAssignee: {} });
  return (await ctx.db.get(id))!;
}

function bump(rec: Record<string, number>, key: string, by: number) {
  const n = (rec[key] ?? 0) + by;
  if (n <= 0) delete rec[key];
  else rec[key] = n;
}

/** Apply a batch of (oldLead, newLead) transitions to the counters doc. */
async function applyCounterDelta(
  ctx: MutationCtx,
  changes: { before: Pick<Doc<"leads">, "statusId" | "assignedTo"> | null; after: Pick<Doc<"leads">, "statusId" | "assignedTo"> | null }[],
) {
  const c = await counters(ctx);
  const byStatus = { ...c.byStatus };
  const byAssignee = { ...c.byAssignee };
  let total = c.total;
  let changed = false;
  for (const { before, after } of changes) {
    if (before && after && before.statusId === after.statusId && before.assignedTo === after.assignedTo) continue;
    changed = true;
    if (before) {
      bump(byStatus, before.statusId, -1);
      bump(byAssignee, aKey(before.assignedTo), -1);
      total--;
    }
    if (after) {
      bump(byStatus, after.statusId, 1);
      bump(byAssignee, aKey(after.assignedTo), 1);
      total++;
    }
  }
  if (changed) await ctx.db.patch(c._id, { total: Math.max(0, total), byStatus, byAssignee });
}

export function derivedFields(defs: FieldDefLike[], fields: Record<string, unknown>) {
  // DECISION: the first email-type and first phone-type field drive duplicate detection.
  const emailDef = defs.find((d) => d.type === "email");
  const phoneDef = defs.find((d) => d.type === "phone");
  return {
    searchText: buildSearchText(defs, fields),
    emailKey: emailDef ? normalizeEmail(fields[emailDef.key]) : undefined,
    phoneKey: phoneDef ? normalizePhone(fields[phoneDef.key]) : undefined,
  };
}

export type NewLead = Omit<Doc<"leads">, "_id" | "_creationTime" | "searchText" | "emailKey" | "phoneKey">;

export async function insertLeads(ctx: MutationCtx, defs: FieldDefLike[], leads: NewLead[]) {
  const ids: Id<"leads">[] = [];
  for (const l of leads) {
    ids.push(await ctx.db.insert("leads", { ...l, ...derivedFields(defs, l.fields) }));
  }
  await applyCounterDelta(ctx, leads.map((l) => ({ before: null, after: l })));
  return ids;
}

export async function patchLead(
  ctx: MutationCtx,
  lead: Doc<"leads">,
  patch: Partial<Omit<Doc<"leads">, "_id" | "_creationTime">>,
  defs?: FieldDefLike[],
) {
  const next = { ...patch, lastActivityAt: Date.now() } as Partial<Doc<"leads">>;
  if (patch.fields) Object.assign(next, derivedFields(defs ?? (await activeFieldDefs(ctx)), patch.fields));
  await ctx.db.patch(lead._id, next);
  if (("statusId" in patch && patch.statusId !== lead.statusId) || ("assignedTo" in patch && patch.assignedTo !== lead.assignedTo)) {
    await applyCounterDelta(ctx, [
      {
        before: lead,
        after: {
          statusId: patch.statusId ?? lead.statusId,
          assignedTo: "assignedTo" in patch ? patch.assignedTo : lead.assignedTo,
        },
      },
    ]);
  }
}

export async function removeLead(ctx: MutationCtx, lead: Doc<"leads">) {
  for (const a of await ctx.db.query("activities").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).collect()) {
    await ctx.db.delete(a._id);
  }
  for (const m of await ctx.db.query("meetings").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).collect()) {
    await ctx.db.delete(m._id);
  }
  // DECISION: pending commissions on a deleted lead are voided; paid ones are kept for the books.
  for (const c of await ctx.db.query("commissions").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).collect()) {
    if (c.status === "pending") await ctx.db.patch(c._id, { status: "void" });
  }
  await ctx.db.delete(lead._id);
  await applyCounterDelta(ctx, [{ before: lead, after: null }]);
}

export async function logActivity(
  ctx: MutationCtx,
  leadId: Id<"leads">,
  actorId: Id<"users">,
  type: Doc<"activities">["type"],
  payload: Record<string, unknown>,
) {
  await ctx.db.insert("activities", { leadId, actorId, type, payload, createdAt: Date.now() });
}

/** Recompute counters from scratch (used by seed / repair). */
export async function rebuildCounters(ctx: MutationCtx) {
  const c = await counters(ctx);
  const byStatus: Record<string, number> = {};
  const byAssignee: Record<string, number> = {};
  let total = 0;
  for await (const l of ctx.db.query("leads")) {
    total++;
    bump(byStatus, l.statusId, 1);
    bump(byAssignee, aKey(l.assignedTo), 1);
  }
  await ctx.db.patch(c._id, { total, byStatus, byAssignee });
}
