import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isAdmin, requireAdmin, requireUser } from "./lib/auth";
import { logActivity } from "./lib/leads";
import { commissionStatus } from "./lib/validators";

export const list = query({
  args: { status: v.optional(commissionStatus), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    // Members only ever see their own.
    const userId = isAdmin(user) ? args.userId : user._id;
    let rows;
    if (userId) rows = await ctx.db.query("commissions").withIndex("by_user", (q) => q.eq("userId", userId)).order("desc").take(1000);
    else if (args.status) rows = await ctx.db.query("commissions").withIndex("by_status", (q) => q.eq("status", args.status!)).order("desc").take(1000);
    else rows = await ctx.db.query("commissions").withIndex("by_created").order("desc").take(1000);
    // DECISION: list is capped at the latest 1,000 rows; plenty for a small team.
    return args.status ? rows.filter((r) => r.status === args.status) : rows;
  },
});

/** Badge in the sidebar: admin = all pending, member = own pending. */
export const pendingCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const pending = await ctx.db.query("commissions").withIndex("by_status", (q) => q.eq("status", "pending")).collect();
    return isAdmin(user) ? pending.length : pending.filter((c) => c.userId === user._id).length;
  },
});

export const update = mutation({
  args: { id: v.id("commissions"), saleAmount: v.optional(v.number()), rate: v.optional(v.number()) },
  handler: async (ctx, { id, saleAmount, rate }) => {
    const admin = await requireAdmin(ctx);
    const c = await ctx.db.get(id);
    if (!c) throw new ConvexError("Commission not found");
    if (c.status !== "pending") throw new ConvexError("Only pending commissions can be edited");
    const sale = saleAmount ?? c.saleAmount;
    const r = rate ?? c.rate;
    if (!(sale > 0)) throw new ConvexError("Sale amount must be positive");
    if (r < 0 || r > 100) throw new ConvexError("Rate must be between 0 and 100");
    const amount = Math.round(sale * r) / 100;
    await ctx.db.patch(id, { saleAmount: sale, rate: r, amount });
    const lead = await ctx.db.get(c.leadId);
    if (lead && saleAmount !== undefined) await ctx.db.patch(lead._id, { saleAmount: sale });
    if (lead) {
      await logActivity(ctx, c.leadId, admin._id, "sale", {
        edited: true,
        from: { saleAmount: c.saleAmount, rate: c.rate, amount: c.amount },
        to: { saleAmount: sale, rate: r, amount },
        currency: c.currency,
      });
    }
  },
});

export const markPaid = mutation({
  args: { ids: v.array(v.id("commissions")) },
  handler: async (ctx, { ids }) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    let n = 0;
    for (const id of ids) {
      const c = await ctx.db.get(id);
      if (!c || c.status !== "pending") continue;
      await ctx.db.patch(id, { status: "paid", paidAt: now });
      if (await ctx.db.get(c.leadId)) {
        await logActivity(ctx, c.leadId, admin._id, "sale", { paid: true, amount: c.amount, currency: c.currency });
      }
      n++;
    }
    return n;
  },
});
