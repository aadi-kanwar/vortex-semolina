import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/auth";
import { statusKind } from "./lib/validators";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db.query("statuses").withIndex("by_order").collect();
  },
});

const hexRe = /^#[0-9a-fA-F]{6}$/;

export const create = mutation({
  args: { name: v.string(), color: v.string(), kind: statusKind },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (!name || name.length > 40) throw new ConvexError("Name must be 1–40 characters");
    if (!hexRe.test(args.color)) throw new ConvexError("Pick a color");
    const all = await ctx.db.query("statuses").collect();
    if (all.some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new ConvexError("A status with that name exists");
    const order = all.reduce((m, s) => Math.max(m, s.order), -1) + 1;
    return await ctx.db.insert("statuses", { name, color: args.color, kind: args.kind, order });
  },
});

export const update = mutation({
  args: { id: v.id("statuses"), name: v.optional(v.string()), color: v.optional(v.string()), kind: v.optional(statusKind) },
  handler: async (ctx, { id, ...args }) => {
    await requireAdmin(ctx);
    const s = await ctx.db.get(id);
    if (!s) throw new ConvexError("Status not found");
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name || name.length > 40) throw new ConvexError("Name must be 1–40 characters");
      patch.name = name;
    }
    if (args.color !== undefined) {
      if (!hexRe.test(args.color)) throw new ConvexError("Pick a color");
      patch.color = args.color;
    }
    if (args.kind !== undefined) {
      // DECISION: seeded system statuses keep their kind so the meeting / won flow stays intact.
      if (s.key && args.kind !== s.kind) throw new ConvexError("Built-in statuses keep their kind");
      patch.kind = args.kind;
    }
    await ctx.db.patch(id, patch);
  },
});

export const reorder = mutation({
  args: { ids: v.array(v.id("statuses")) },
  handler: async (ctx, { ids }) => {
    await requireAdmin(ctx);
    for (let i = 0; i < ids.length; i++) await ctx.db.patch(ids[i], { order: i });
  },
});

// DECISION: statuses can't be deleted (spec lists rename/recolor/reorder/add);
// deleting would orphan leads. Admins can rename an unused one instead.
