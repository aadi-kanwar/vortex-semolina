import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { canSeeLead, isAdmin, loadLeadForEdit, requireAdmin, requireUser } from "./lib/auth";
import { createCommission, pendingCommissionsFor } from "./lib/commissions";
import { activeFieldDefs, insertLeads, logActivity, patchLead, removeLead } from "./lib/leads";
import { coerceFieldValue, leadTitle } from "./lib/shared";

export const viewArg = v.union(
  v.literal("all"),
  v.literal("mine"),
  v.literal("unassigned"),
  v.literal("meetings_requested"),
  v.literal("won"),
);

export const listArgs = {
  view: viewArg,
  search: v.optional(v.string()),
  statusIds: v.optional(v.array(v.id("statuses"))),
  // "unassigned" or a user id string
  assignee: v.optional(v.string()),
  // { fieldKey: value } equality filters for select / checkbox fields
  fieldEquals: v.optional(v.record(v.string(), v.union(v.string(), v.boolean()))),
  followUpDue: v.optional(v.boolean()),
  sort: v.optional(v.union(v.literal("created"), v.literal("activity"), v.literal("followup"))),
  order: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
};

type ListArgs = {
  view: "all" | "mine" | "unassigned" | "meetings_requested" | "won";
  search?: string;
  statusIds?: Id<"statuses">[];
  assignee?: string;
  fieldEquals?: Record<string, string | boolean>;
  followUpDue?: boolean;
  sort?: "created" | "activity" | "followup";
  order?: "asc" | "desc";
};

/**
 * Build the lead query for a view + filters. Uses an index for the most
 * selective part (assignee / search) and `.filter()` for the rest, so it
 * stays cheap with cursor pagination at 10k+ leads.
 */
async function buildLeadQuery(ctx: QueryCtx, user: Doc<"users">, args: ListArgs) {
  const statuses = await ctx.db.query("statuses").collect();
  let statusIds = args.statusIds?.length ? [...args.statusIds] : undefined;
  const viewStatus =
    args.view === "meetings_requested"
      ? statuses.filter((s) => s.key === "meeting_requested")
      : args.view === "won"
        ? statuses.filter((s) => s.kind === "won")
        : null;
  if (viewStatus) {
    const ids = viewStatus.map((s) => s._id);
    statusIds = statusIds ? statusIds.filter((id) => ids.includes(id)) : ids;
    if (statusIds.length === 0) statusIds = ["__none__" as Id<"statuses">];
  }

  // Resolve the assignee constraint: undefined = no constraint, null = unassigned.
  let assignee: Id<"users"> | null | undefined;
  if (args.view === "mine") assignee = user._id;
  else if (args.view === "unassigned") assignee = null;
  if (args.assignee) {
    const a = args.assignee === "unassigned" ? null : (args.assignee as Id<"users">);
    if (assignee !== undefined && assignee !== a) assignee = "__none__" as Id<"users">;
    else assignee = a;
  }
  // Members only ever see unassigned + their own.
  const memberScope = !isAdmin(user) && assignee === undefined;
  if (!isAdmin(user) && assignee && assignee !== user._id) assignee = "__none__" as Id<"users">;

  const fieldEquals = Object.entries(args.fieldEquals ?? {}).filter(([k]) => /^[a-z][a-z0-9_]*$/.test(k));
  const now = Date.now();
  const endOfDay = now + 24 * 3600 * 1000; // DECISION: "due" = within the next 24h or overdue.

  const applyFilters = <Q extends { filter: (fn: (q: any) => any) => Q }>(q: Q): Q => {
    let out = q;
    if (memberScope) out = out.filter((f: any) => f.or(f.eq(f.field("assignedTo"), user._id), f.eq(f.field("assignedTo"), undefined)));
    if (statusIds && !(statusIds.length === 1 && args.search)) {
      const ids = statusIds;
      out = out.filter((f: any) => f.or(...ids.map((id) => f.eq(f.field("statusId"), id))));
    }
    for (const [k, val] of fieldEquals) out = out.filter((f: any) => f.eq(f.field(`fields.${k}`), val));
    if (args.followUpDue) {
      out = out.filter((f: any) => f.and(f.neq(f.field("nextFollowUpAt"), undefined), f.lte(f.field("nextFollowUpAt"), endOfDay)));
    }
    return out;
  };

  const search = args.search?.trim();
  if (search) {
    const q = ctx.db.query("leads").withSearchIndex("search_text", (s) => {
      let sq = s.search("searchText", search);
      if (statusIds?.length === 1) sq = sq.eq("statusId", statusIds[0]);
      if (assignee !== undefined) sq = sq.eq("assignedTo", assignee ?? undefined);
      return sq;
    });
    return applyFilters(q as any) as typeof q;
  }

  const order = args.order ?? "desc";
  const sort = args.sort ?? "created";
  const base = ctx.db.query("leads");
  let q;
  if (assignee !== undefined) {
    const a = assignee ?? undefined;
    if (sort === "activity") q = base.withIndex("by_assignee_activity", (i) => i.eq("assignedTo", a)).order(order);
    else if (sort === "followup") q = base.withIndex("by_assignee_followup", (i) => i.eq("assignedTo", a).gt("nextFollowUpAt", 0)).order(order);
    else q = base.withIndex("by_assignee", (i) => i.eq("assignedTo", a)).order(order);
  } else if (statusIds?.length === 1 && sort === "created") {
    q = base.withIndex("by_status", (i) => i.eq("statusId", statusIds![0])).order(order);
  } else if (sort === "activity") q = base.withIndex("by_activity").order(order);
  else if (sort === "followup") q = base.withIndex("by_followup", (i) => i.gt("nextFollowUpAt", 0)).order(order);
  else q = base.order(order);
  return applyFilters(q as any) as typeof q;
}

export const list = query({
  args: { ...listArgs, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts, ...args }) => {
    const user = await requireUser(ctx);
    const q = await buildLeadQuery(ctx, user, args);
    const page = await q.paginate(paginationOpts);
    return { ...page, page: page.page.map(({ searchText: _s, emailKey: _e, phoneKey: _p, ...l }) => l) };
  },
});

export const get = query({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const lead = await ctx.db.get(id);
    if (!lead || !canSeeLead(user, lead)) return null;
    return lead;
  },
});

/** Sidebar count: admin = all, member = unassigned + own. */
export const count = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const c = await ctx.db.query("counters").first();
    if (!c) return 0;
    if (isAdmin(user)) return c.total;
    return (c.byAssignee["unassigned"] ?? 0) + (c.byAssignee[user._id] ?? 0);
  },
});

export const activities = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const user = await requireUser(ctx);
    const lead = await ctx.db.get(leadId);
    if (!lead || !canSeeLead(user, lead)) return [];
    return await ctx.db.query("activities").withIndex("by_lead", (q) => q.eq("leadId", leadId)).order("desc").take(200);
  },
});

async function validateFields(ctx: QueryCtx, input: Record<string, unknown>, partial: boolean) {
  const defs = await activeFieldDefs(ctx);
  const out: Record<string, unknown> = {};
  for (const d of defs) {
    if (partial && !(d.key in input)) continue;
    try {
      const val = coerceFieldValue(d, input[d.key]);
      if (val !== undefined) out[d.key] = val;
    } catch (e) {
      throw new ConvexError((e as Error).message);
    }
  }
  return { defs, values: out };
}

export const create = mutation({
  args: { fields: v.record(v.string(), v.any()), assignToMe: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const { defs, values } = await validateFields(ctx, args.fields, false);
    const status = (await ctx.db.query("statuses").withIndex("by_order").first())!;
    // DECISION: members' new leads are assigned to themselves; admins' are unassigned unless asked.
    const assignedTo = !isAdmin(user) || args.assignToMe ? user._id : undefined;
    const now = Date.now();
    const [id] = await insertLeads(ctx, defs, [
      { fields: values, statusId: status._id, assignedTo, lastActivityAt: now, createdBy: user._id, createdAt: now },
    ]);
    await logActivity(ctx, id, user._id, "field", { created: true });
    if (assignedTo) await logActivity(ctx, id, user._id, "assign", { from: null, to: assignedTo });
    return id;
  },
});

export const updateField = mutation({
  args: { id: v.id("leads"), key: v.string(), value: v.any() },
  handler: async (ctx, { id, key, value }) => {
    const user = await requireUser(ctx);
    const lead = await loadLeadForEdit(ctx, user, id);
    const defs = await activeFieldDefs(ctx);
    const def = defs.find((d) => d.key === key);
    if (!def) throw new ConvexError("Unknown field");
    let coerced: unknown;
    try {
      coerced = coerceFieldValue(def, value);
    } catch (e) {
      throw new ConvexError((e as Error).message);
    }
    const before = lead.fields[key];
    if (JSON.stringify(before) === JSON.stringify(coerced)) return;
    const fields = { ...lead.fields };
    if (coerced === undefined) delete fields[key];
    else fields[key] = coerced;
    await patchLead(ctx, lead, { fields }, defs);
    await logActivity(ctx, id, user._id, "field", { key, label: def.label, from: before ?? null, to: coerced ?? null });
  },
});

export const setFollowUp = mutation({
  args: { id: v.id("leads"), at: v.optional(v.number()) },
  handler: async (ctx, { id, at }) => {
    const user = await requireUser(ctx);
    const lead = await loadLeadForEdit(ctx, user, id);
    await patchLead(ctx, lead, { nextFollowUpAt: at });
    await logActivity(ctx, id, user._id, "field", { key: "nextFollowUpAt", label: "Follow-up", from: lead.nextFollowUpAt ?? null, to: at ?? null });
  },
});

export const addNote = mutation({
  args: { id: v.id("leads"), text: v.string(), followUpAt: v.optional(v.number()) },
  handler: async (ctx, { id, text, followUpAt }) => {
    const user = await requireUser(ctx);
    const lead = await loadLeadForEdit(ctx, user, id);
    const body = text.trim();
    if (!body) throw new ConvexError("Note is empty");
    if (body.length > 5000) throw new ConvexError("Note is too long");
    await patchLead(ctx, lead, { lastNote: body.slice(0, 280), ...(followUpAt ? { nextFollowUpAt: followUpAt } : {}) });
    await logActivity(ctx, id, user._id, "note", { text: body, followUpAt: followUpAt ?? null });
  },
});

/** Shared status-change logic (single + bulk + meeting flow). */
export async function changeStatus(
  ctx: Parameters<typeof logActivity>[0],
  user: Doc<"users">,
  lead: Doc<"leads">,
  statusId: Id<"statuses">,
  opts: { saleAmount?: number; lostReason?: string; confirmVoid?: boolean },
) {
  if (lead.statusId === statusId) return;
  const [from, to] = await Promise.all([ctx.db.get(lead.statusId), ctx.db.get(statusId)]);
  if (!to) throw new ConvexError("Status not found");
  const patch: Partial<Doc<"leads">> = { statusId };
  if (to.kind === "won") {
    if (opts.saleAmount === undefined || !Number.isFinite(opts.saleAmount) || opts.saleAmount <= 0) {
      throw new ConvexError("Enter the sale amount to mark this lead Won");
    }
    patch.saleAmount = opts.saleAmount;
    patch.wonAt = Date.now();
    patch.lostReason = undefined;
  } else if (from?.kind === "won") {
    const pending = await pendingCommissionsFor(ctx, lead._id);
    if (pending.length && !opts.confirmVoid) throw new ConvexError("CONFIRM_VOID");
    for (const c of pending) await ctx.db.patch(c._id, { status: "void" });
    patch.wonAt = undefined;
    patch.saleAmount = undefined;
  }
  if (to.kind === "lost") patch.lostReason = opts.lostReason?.trim().slice(0, 500) || undefined;
  await patchLead(ctx, lead, patch);
  await logActivity(ctx, lead._id, user._id, "status", {
    from: lead.statusId,
    to: statusId,
    fromName: from?.name,
    toName: to.name,
    fromKey: from?.key ?? null,
    toKey: to.key ?? null,
    lostReason: patch.lostReason ?? null,
  });
  if (to.kind === "won" && from?.kind !== "won") {
    await createCommission(ctx, { ...lead, ...patch } as Doc<"leads">, opts.saleAmount!, user._id);
  }
}

export const setStatus = mutation({
  args: {
    id: v.id("leads"),
    statusId: v.id("statuses"),
    saleAmount: v.optional(v.number()),
    lostReason: v.optional(v.string()),
    confirmVoid: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, statusId, ...opts }) => {
    const user = await requireUser(ctx);
    const lead = await loadLeadForEdit(ctx, user, id);
    await changeStatus(ctx, user, lead, statusId, opts);
  },
});

/** Atomic claim: Convex serialises conflicting mutations, so only one claimer wins. */
export const claim = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const lead = await ctx.db.get(id);
    if (!lead) throw new ConvexError("Lead not found");
    if (lead.assignedTo) {
      if (lead.assignedTo === user._id) return;
      const owner = await ctx.db.get(lead.assignedTo);
      throw new ConvexError(`Already claimed by ${owner?.name ?? "someone else"}`);
    }
    await patchLead(ctx, lead, { assignedTo: user._id });
    await logActivity(ctx, id, user._id, "assign", { from: null, to: user._id, claimed: true });
  },
});

const MAX_BULK = 500;

export const assign = mutation({
  args: { ids: v.array(v.id("leads")), userId: v.optional(v.id("users")) },
  handler: async (ctx, { ids, userId }) => {
    const admin = await requireAdmin(ctx);
    if (ids.length > MAX_BULK) throw new ConvexError(`At most ${MAX_BULK} leads at a time`);
    if (userId) {
      const target = await ctx.db.get(userId);
      if (!target || !target.active) throw new ConvexError("Pick an active member");
    }
    let changed = 0;
    for (const id of ids) {
      const lead = await ctx.db.get(id);
      if (!lead || lead.assignedTo === userId) continue;
      await patchLead(ctx, lead, { assignedTo: userId });
      await logActivity(ctx, id, admin._id, "assign", { from: lead.assignedTo ?? null, to: userId ?? null });
      // Keep open meetings with the lead's owner.
      for (const m of await ctx.db.query("meetings").withIndex("by_lead", (q) => q.eq("leadId", id)).collect()) {
        if (userId && (m.status === "requested" || m.status === "scheduled")) await ctx.db.patch(m._id, { ownerId: userId });
      }
      changed++;
    }
    return changed;
  },
});

export const bulkSetStatus = mutation({
  args: { ids: v.array(v.id("leads")), statusId: v.id("statuses") },
  handler: async (ctx, { ids, statusId }) => {
    const admin = await requireAdmin(ctx);
    if (ids.length > MAX_BULK) throw new ConvexError(`At most ${MAX_BULK} leads at a time`);
    const to = await ctx.db.get(statusId);
    if (!to) throw new ConvexError("Status not found");
    if (to.kind === "won") throw new ConvexError("Mark leads Won one at a time (each needs a sale amount)");
    let changed = 0;
    for (const id of ids) {
      const lead = await ctx.db.get(id);
      if (!lead) continue;
      // DECISION: bulk status change voids pending commissions without a per-lead prompt
      // (the bulk confirm dialog covers it).
      await changeStatus(ctx, admin, lead, statusId, { confirmVoid: true });
      changed++;
    }
    return changed;
  },
});

export const bulkDelete = mutation({
  args: { ids: v.array(v.id("leads")) },
  handler: async (ctx, { ids }) => {
    await requireAdmin(ctx);
    if (ids.length > 200) throw new ConvexError("Delete at most 200 leads at a time");
    for (const id of ids) {
      const lead = await ctx.db.get(id);
      if (lead) await removeLead(ctx, lead);
    }
  },
});

/** Light search for the ⌘K palette. */
export const quickSearch = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const user = await requireUser(ctx);
    const term = q.trim();
    if (!term) return [];
    const res = await ctx.db
      .query("leads")
      .withSearchIndex("search_text", (s) => s.search("searchText", term))
      .take(25);
    return res
      .filter((l) => canSeeLead(user, l))
      .slice(0, 8)
      .map((l) => ({ _id: l._id, title: leadTitle(l.fields), company: l.fields.company as string | undefined, statusId: l.statusId }));
  },
});
