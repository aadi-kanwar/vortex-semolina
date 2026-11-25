import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { logActivity } from "./leads";
import { effectiveRate, getSettings } from "./settings";
import { leadTitle } from "./shared";

/** Snapshot rate + amount at the moment of winning. */
export async function createCommission(ctx: MutationCtx, lead: Doc<"leads">, saleAmount: number, actorId: Id<"users">) {
  if (!lead.assignedTo) return null; // DECISION: unassigned Won leads earn no commission.
  const owner = await ctx.db.get(lead.assignedTo);
  if (!owner) return null;
  const settings = await getSettings(ctx);
  const rate = effectiveRate(owner, settings);
  const amount = Math.round(saleAmount * rate) / 100;
  const id = await ctx.db.insert("commissions", {
    leadId: lead._id,
    leadName: leadTitle(lead.fields),
    userId: owner._id,
    saleAmount,
    rate,
    amount,
    currency: settings.currency,
    status: "pending",
    createdAt: Date.now(),
  });
  await logActivity(ctx, lead._id, actorId, "sale", { saleAmount, rate, amount, currency: settings.currency, userId: owner._id });
  return id;
}

export async function pendingCommissionsFor(ctx: MutationCtx, leadId: Id<"leads">) {
  const all = await ctx.db.query("commissions").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect();
  return all.filter((c) => c.status === "pending");
}
