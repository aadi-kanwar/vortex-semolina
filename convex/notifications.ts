import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", user._id).eq("read", false)).order("desc").take(20);
    return unread;
  },
});

export const markRead = mutation({
  args: { ids: v.array(v.id("notifications")) },
  handler: async (ctx, { ids }) => {
    const user = await requireUser(ctx);
    for (const id of ids) {
      const n = await ctx.db.get(id);
      if (n && n.userId === user._id) await ctx.db.patch(id, { read: true });
    }
  },
});
