import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/auth";
import { getSettings } from "./lib/settings";

export const get = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await getSettings(ctx);
  },
});

const timeRe = /^([01]\d|2[0-3]):(00|30)$/;

export const update = mutation({
  args: {
    currency: v.optional(v.string()),
    defaultCommissionRate: v.optional(v.number()),
    slotCapacity: v.optional(v.number()),
    teamTimeZone: v.optional(v.string()),
    workingHours: v.optional(v.object({ days: v.array(v.number()), start: v.string(), end: v.string() })),
    blockedDates: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.currency !== undefined && !/^[A-Z]{3}$/.test(args.currency)) throw new ConvexError("Currency must be a 3-letter ISO code");
    if (args.defaultCommissionRate !== undefined && (args.defaultCommissionRate < 0 || args.defaultCommissionRate > 100)) {
      throw new ConvexError("Commission rate must be between 0 and 100");
    }
    if (args.slotCapacity !== undefined && (!Number.isInteger(args.slotCapacity) || args.slotCapacity < 1 || args.slotCapacity > 20)) {
      throw new ConvexError("Slot capacity must be a whole number from 1 to 20");
    }
    if (args.teamTimeZone !== undefined) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: args.teamTimeZone });
      } catch {
        throw new ConvexError("Unknown time zone");
      }
    }
    if (args.workingHours) {
      const { days, start, end } = args.workingHours;
      if (!timeRe.test(start) || !timeRe.test(end)) throw new ConvexError("Working hours must be on :00 or :30");
      if (start >= end) throw new ConvexError("Working hours must end after they start");
      if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new ConvexError("Bad working day");
    }
    if (args.blockedDates?.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new ConvexError("Blocked dates must be YYYY-MM-DD");
    const existing = await ctx.db.query("settings").first();
    const patch = Object.fromEntries(Object.entries(args).filter(([, val]) => val !== undefined));
    if (existing) await ctx.db.patch(existing._id, patch);
    else throw new ConvexError("Settings not initialised yet");
  },
});
