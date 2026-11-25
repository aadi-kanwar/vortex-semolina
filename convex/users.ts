import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getViewer, requireAdmin, requireUser } from "./lib/auth";
import { ensureSeeded } from "./lib/settings";
import { role, themePreference } from "./lib/validators";

/** Called by the client right after Clerk sign-in. Creates/refreshes the user row. */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not signed in");
    await ensureSeeded(ctx);
    const name = identity.name || [identity.givenName, identity.familyName].filter(Boolean).join(" ") || identity.email?.split("@")[0] || "Teammate";
    const email = (identity.email ?? "").toLowerCase();
    const existing = await getViewer(ctx);
    if (existing) {
      if (existing.name !== name || existing.email !== email || existing.avatarUrl !== identity.pictureUrl) {
        await ctx.db.patch(existing._id, { name, email, avatarUrl: identity.pictureUrl });
      }
      return existing._id;
    }
    // DECISION: "first user becomes admin" is implemented as "if there is no
    // active admin yet, you become admin". This survives the seed script, which
    // inserts demo members before anyone signs up.
    const admins = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).collect();
    const hasAdmin = admins.some((a) => a.active);
    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      name,
      email,
      avatarUrl: identity.pictureUrl,
      role: hasAdmin ? "member" : "admin",
      active: true,
      themePreference: "system",
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const u = await getViewer(ctx);
    return u;
  },
});

/** Everyone on the team (for avatars, assignee pickers, filters). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const users = await ctx.db.query("users").collect();
    return users
      .map(({ clerkId: _c, ...u }) => u)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const setTheme = mutation({
  args: { theme: themePreference },
  handler: async (ctx, { theme }) => {
    const u = await requireUser(ctx);
    await ctx.db.patch(u._id, { themePreference: theme });
  },
});

export const setRole = mutation({
  args: { userId: v.id("users"), role },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === args.userId && args.role !== "admin") {
      throw new ConvexError("You can't remove your own admin role");
    }
    await ctx.db.patch(args.userId, { role: args.role });
  },
});

export const setActive = mutation({
  args: { userId: v.id("users"), active: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (admin._id === args.userId) throw new ConvexError("You can't deactivate yourself");
    // Leads stay assigned so admins can see and reassign them.
    await ctx.db.patch(args.userId, { active: args.active });
  },
});

export const setCommissionOverride = mutation({
  args: { userId: v.id("users"), rate: v.optional(v.number()) },
  handler: async (ctx, { userId, rate }) => {
    await requireAdmin(ctx);
    if (rate !== undefined && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
      throw new ConvexError("Rate must be between 0 and 100");
    }
    await ctx.db.patch(userId, { commissionRateOverride: rate });
  },
});

/** Recovery: `npx convex run users:makeAdmin '{"email":"you@company.com"}'` */
export const makeAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const u = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email.toLowerCase())).unique();
    if (!u) throw new ConvexError(`No user with email ${email}. Sign in once first.`);
    await ctx.db.patch(u._id, { role: "admin", active: true });
    return u._id;
  },
});
