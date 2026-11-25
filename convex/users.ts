import { createAccount, getAuthSessionId, getAuthUserId, invalidateSessions, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type ActionCtx } from "./_generated/server";
import { getViewer, requireAdmin, requireUser } from "./lib/auth";
import { ensureSeeded } from "./lib/settings";
import { role, themePreference } from "./lib/validators";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PROVIDER = "password";

function checkPassword(pw: string) {
  if (pw.length < 8) throw new ConvexError("Password must be at least 8 characters");
  if (pw.length > 72) throw new ConvexError("Password must be at most 72 characters");
}

/** Called by the client after sign-in: makes sure settings/statuses/fields exist. */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await getViewer(ctx);
    if (!me) return "no_access" as const;
    await ensureSeeded(ctx);
    return "ok" as const;
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    return await getViewer(ctx);
  },
});

/** Everyone on the team (for avatars, assignee pickers, filters). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const users = await ctx.db.query("users").collect();
    return users.sort((a, b) => a.name.localeCompare(b.name));
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
    if (!args.active) await ctx.scheduler.runAfter(0, internal.users.signOutEverywhere, { userId: args.userId });
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

// ---------- Accounts & passwords (Convex Auth) ----------

export const viewer = internalQuery({
  args: {},
  handler: async (ctx) => await getViewer(ctx),
});

export const byEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).first(),
});

export const byId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await ctx.db.get(userId),
});

export const patchInternal = internalMutation({
  args: { userId: v.id("users"), mustChangePassword: v.optional(v.boolean()), role: v.optional(role), active: v.optional(v.boolean()) },
  handler: async (ctx, { userId, ...patch }) => {
    await ctx.db.patch(userId, Object.fromEntries(Object.entries(patch).filter(([, x]) => x !== undefined)));
  },
});

export const ensureSeededInternal = internalMutation({ args: {}, handler: async (ctx) => ensureSeeded(ctx) });

export const signOutEverywhere = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => invalidateSessions(ctx, { userId }),
});

async function requireAdminAction(ctx: ActionCtx) {
  const me = await ctx.runQuery(internal.users.viewer, {});
  if (!me || !me.active) throw new ConvexError("Not signed in");
  if (me.role !== "admin") throw new ConvexError("Admins only");
  return me;
}

async function newAccount(ctx: ActionCtx, a: { name: string; email: string; role: "admin" | "member"; password: string; mustChangePassword: boolean }) {
  const email = a.email.trim().toLowerCase();
  const name = a.name.trim();
  if (!name || name.length > 80) throw new ConvexError("Name must be 1–80 characters");
  if (!EMAIL_RE.test(email)) throw new ConvexError("Enter a valid email");
  checkPassword(a.password);
  if (await ctx.runQuery(internal.users.byEmail, { email })) throw new ConvexError("Someone with that email is already on the team");
  const { user } = await createAccount(ctx, {
    provider: PROVIDER,
    account: { id: email, secret: a.password },
    profile: { name, email, role: a.role, mustChangePassword: a.mustChangePassword } as never,
  });
  return user._id as Id<"users">;
}

/** Team → Add member: creates the login with a temporary password. */
export const addMember = action({
  args: { name: v.string(), email: v.string(), role, password: v.string() },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);
    return await newAccount(ctx, { ...args, mustChangePassword: true });
  },
});

/** Team → Reset password: new temporary password, signed out everywhere. */
export const resetPassword = action({
  args: { userId: v.id("users"), password: v.string() },
  handler: async (ctx, { userId, password }) => {
    const admin = await requireAdminAction(ctx);
    if (admin._id === userId) throw new ConvexError("Use “Change password” for your own account");
    checkPassword(password);
    const target = await ctx.runQuery(internal.users.byId, { userId });
    if (!target) throw new ConvexError("Member not found");
    await modifyAccountCredentials(ctx, { provider: PROVIDER, account: { id: target.email, secret: password } });
    await invalidateSessions(ctx, { userId });
    await ctx.runMutation(internal.users.patchInternal, { userId, mustChangePassword: true });
  },
});

/** Signed-in user changes their own password (required after a temporary one). */
export const changePassword = action({
  args: { current: v.string(), next: v.string() },
  handler: async (ctx, { current, next }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Not signed in");
    const me = await ctx.runQuery(internal.users.byId, { userId });
    if (!me || !me.active) throw new ConvexError("Not signed in");
    checkPassword(next);
    if (next === current) throw new ConvexError("Choose a different password");
    try {
      await retrieveAccount(ctx, { provider: PROVIDER, account: { id: me.email, secret: current } });
    } catch {
      throw new ConvexError("Current password is wrong");
    }
    await modifyAccountCredentials(ctx, { provider: PROVIDER, account: { id: me.email, secret: next } });
    const sessionId = await getAuthSessionId(ctx);
    await invalidateSessions(ctx, { userId, except: sessionId ? [sessionId] : [] });
    await ctx.runMutation(internal.users.patchInternal, { userId, mustChangePassword: false });
  },
});

export const hasActiveAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    const admins = await ctx.db.query("users").withIndex("by_role", (q) => q.eq("role", "admin")).collect();
    return admins.some((a) => a.active);
  },
});

/**
 * First-admin bootstrap from Convex environment variables:
 *   ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD (temporary)
 * The sign-in page calls this on load. It only acts while NO active admin
 * exists, so it's safe to leave public. Remove ADMIN_PASSWORD afterwards.
 */
export const bootstrapAdmin = action({
  args: {},
  handler: async (ctx): Promise<"not_configured" | "exists" | "created"> => {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return "not_configured";
    if (await ctx.runQuery(internal.users.hasActiveAdmin, {})) return "exists";
    if (await ctx.runQuery(internal.users.byEmail, { email })) return "exists";
    await ctx.runMutation(internal.users.ensureSeededInternal, {});
    try {
      await newAccount(ctx, { email, name: process.env.ADMIN_NAME?.trim() || email.split("@")[0], password, role: "admin", mustChangePassword: true });
    } catch (e) {
      // Two tabs racing: the second one finds the email taken.
      if (await ctx.runQuery(internal.users.byEmail, { email })) return "exists";
      throw e;
    }
    return "created";
  },
});

/**
 * Create the first admin. Run against the production deployment:
 *   npx convex run --prod users:createAdmin '{"email":"you@company.com","name":"Your Name","password":"a-temp-password"}'
 * They sign in at /sign-in and must choose a new password straight away.
 * If the email already exists it is promoted to admin and the password is reset.
 */
export const createAdmin = internalAction({
  args: { email: v.string(), name: v.string(), password: v.string() },
  handler: async (ctx, args): Promise<string> => {
    await ctx.runMutation(internal.users.ensureSeededInternal, {});
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.runQuery(internal.users.byEmail, { email });
    if (existing) {
      checkPassword(args.password);
      await modifyAccountCredentials(ctx, { provider: PROVIDER, account: { id: email, secret: args.password } });
      await ctx.runMutation(internal.users.patchInternal, { userId: existing._id, role: "admin", active: true, mustChangePassword: true });
      return `Promoted ${email} to admin and set a new temporary password`;
    }
    await newAccount(ctx, { ...args, role: "admin", mustChangePassword: true });
    return `Created admin ${email}. Sign in at /sign-in; you'll be asked to choose a new password.`;
  },
});
