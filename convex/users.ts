import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getViewer, requireAdmin, requireUser } from "./lib/auth";
import { ensureSeeded } from "./lib/settings";
import { role, themePreference } from "./lib/validators";

/**
 * Called by the client right after Clerk sign-in. Links the Clerk account to
 * the user row an admin created (matched by verified email).
 * DECISION: there is no self sign-up. People without a row get "no_access".
 */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not signed in");
    await ensureSeeded(ctx);
    const email = (identity.email ?? "").toLowerCase();
    const existing = await getViewer(ctx);
    if (existing) {
      const patch: Record<string, unknown> = {};
      if (email && existing.email !== email) patch.email = email;
      if (existing.avatarUrl !== identity.pictureUrl) patch.avatarUrl = identity.pictureUrl;
      if (Object.keys(patch).length) await ctx.db.patch(existing._id, patch);
      return "ok" as const;
    }
    if (!email || identity.emailVerified === false) return "no_access" as const;
    const pending = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (!pending || pending.clerkId) return "no_access" as const;
    await ctx.db.patch(pending._id, { clerkId: identity.subject, avatarUrl: identity.pictureUrl });
    return "ok" as const;
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
      .map(({ clerkId, ...u }) => ({ ...u, hasSignedIn: !!clerkId }))
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

/**
 * Create (or promote) the first admin. Run against the production deployment:
 *   npx convex run --prod users:createAdmin '{"email":"you@company.com","name":"Your Name"}'
 * Then create the same email in Clerk (Dashboard → Users → Create user) and sign in.
 */
export const createAdmin = internalMutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    await ensureSeeded(ctx);
    const email = args.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ConvexError("Invalid email");
    const existing = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { role: "admin", active: true });
      return `Promoted ${email} to admin`;
    }
    await ctx.db.insert("users", { name: args.name.trim() || email, email, role: "admin", active: true, themePreference: "system" });
    return `Created admin ${email}. Create the same email in Clerk, then sign in.`;
  },
});

/**
 * Step 1 of "Add member" (called by /api/members with the admin's token):
 * reserve the row. The Clerk account is created next; first sign-in links them.
 */
export const reserveMember = mutation({
  args: { name: v.string(), email: v.string(), role },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const email = args.email.trim().toLowerCase();
    const name = args.name.trim();
    if (!name || name.length > 80) throw new ConvexError("Name must be 1–80 characters");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ConvexError("Enter a valid email");
    if (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).first()) {
      throw new ConvexError("Someone with that email is already on the team");
    }
    return await ctx.db.insert("users", { name, email, role: args.role, active: true, themePreference: "system", mustChangePassword: true });
  },
});

/** Undo a reservation when creating the Clerk account failed. */
export const cancelReservation = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const u = await ctx.db.get(userId);
    if (u && !u.clerkId) await ctx.db.delete(userId);
  },
});

/** For /api/members: the Clerk id behind a member (admin only). */
export const clerkIdOf = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const u = await ctx.db.get(userId);
    return u ? { clerkId: u.clerkId ?? null, email: u.email, name: u.name } : null;
  },
});

/** Admin set a new temporary password: force a change on next sign-in. */
export const flagPasswordReset = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { mustChangePassword: true });
  },
});

/** The signed-in user replaced their temporary password. */
export const passwordChanged = mutation({
  args: {},
  handler: async (ctx) => {
    const u = await requireUser(ctx);
    await ctx.db.patch(u._id, { mustChangePassword: false });
  },
});
