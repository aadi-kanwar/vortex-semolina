import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export async function getViewer(ctx: Ctx): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  return userId ? await ctx.db.get(userId) : null;
}

/** Signed-in, synced and active user. Every public function calls this first. */
export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getViewer(ctx);
  if (!user) throw new ConvexError("Not signed in");
  if (!user.active) throw new ConvexError("Your account has been deactivated");
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new ConvexError("Admins only");
  return user;
}

export const isAdmin = (u: Doc<"users">) => u.role === "admin";

/** Members see unassigned leads and their own. */
export function canSeeLead(user: Doc<"users">, lead: Doc<"leads">) {
  return isAdmin(user) || !lead.assignedTo || lead.assignedTo === user._id;
}

/** Members may only edit their own leads. */
export function canEditLead(user: Doc<"users">, lead: Doc<"leads">) {
  return isAdmin(user) || lead.assignedTo === user._id;
}

export async function loadLeadForEdit(ctx: Ctx, user: Doc<"users">, leadId: Id<"leads">) {
  const lead = await ctx.db.get(leadId);
  if (!lead) throw new ConvexError("Lead not found");
  if (!canEditLead(user, lead)) {
    throw new ConvexError(
      lead.assignedTo ? "You can only edit your own leads" : "Claim this lead before editing it",
    );
  }
  return lead;
}
