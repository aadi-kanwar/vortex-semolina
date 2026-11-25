import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { canSeeLead, isAdmin, loadLeadForEdit, requireAdmin, requireUser } from "./lib/auth";
import { logActivity } from "./lib/leads";
import { getSettings, statusByKey } from "./lib/settings";
import { activeCountAt, assertSlotAllowed, slotsForDate } from "./lib/slots";
import { MEET_LINK_RE, leadTitle } from "./lib/shared";
import { changeStatus } from "./leads";

const ACTIVE = new Set(["requested", "scheduled"]);
const TAKEN = "This slot was just taken, pick another";

function assertTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new ConvexError("Unknown time zone");
  }
}

/** Slots for one team-time-zone date with availability. */
export const slotsForDay = query({
  args: { date: v.string(), excludeMeetingId: v.optional(v.id("meetings")) },
  handler: async (ctx, { date, excludeMeetingId }) => {
    await requireUser(ctx);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const settings = await getSettings(ctx);
    const now = Date.now();
    const starts = slotsForDate(settings, date);
    return await Promise.all(
      starts.map(async (startUtc) => {
        const used = await activeCountAt(ctx, startUtc, excludeMeetingId);
        return { startUtc, available: startUtc > now && used < settings.slotCapacity, used };
      }),
    );
  },
});

/** Calendar feed for a UTC range, joined with lead + owner. Live for everyone. */
export const listRange = query({
  args: { startUtc: v.number(), endUtc: v.number() },
  handler: async (ctx, { startUtc, endUtc }) => {
    const user = await requireUser(ctx);
    if (endUtc - startUtc > 45 * 86400000) throw new ConvexError("Range too large");
    const meetings = await ctx.db
      .query("meetings")
      .withIndex("by_start_status", (q) => q.gte("startUtc", startUtc).lt("startUtc", endUtc))
      .collect();
    return await Promise.all(
      meetings.map(async (m) => {
        const lead = await ctx.db.get(m.leadId);
        // Everyone sees the full shared calendar; lead details only if visible to them.
        const visible = !!lead && canSeeLead(user, lead);
        return {
          ...m,
          meetLink: visible || m.ownerId === user._id ? m.meetLink : undefined,
          leadName: lead ? leadTitle(lead.fields) : "Deleted lead",
          company: lead?.fields.company as string | undefined,
          country: lead?.fields.country as string | undefined,
          canOpenLead: visible,
          canEdit: isAdmin(user) || m.ownerId === user._id,
        };
      }),
    );
  },
});

export const forLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const user = await requireUser(ctx);
    const lead = await ctx.db.get(leadId);
    if (!lead || !canSeeLead(user, lead)) return [];
    const ms = await ctx.db.query("meetings").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect();
    return ms.sort((a, b) => b.startUtc - a.startUtc);
  },
});

async function setLeadStatusKey(ctx: MutationCtx, user: Doc<"users">, leadId: Id<"leads">, key: string) {
  const status = await statusByKey(ctx, key);
  const lead = await ctx.db.get(leadId);
  if (!status || !lead) return;
  const current = await ctx.db.get(lead.statusId);
  // DECISION: the meeting flow never pulls a Won/Lost lead back to an open status.
  if (current && current.kind !== "open") return;
  await changeStatus(ctx, user, lead, status._id, {});
}

export const request = mutation({
  args: {
    leadId: v.id("leads"),
    startUtc: v.number(),
    clientTimeZone: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const lead = await loadLeadForEdit(ctx, user, args.leadId);
    assertTz(args.clientTimeZone);
    const settings = await getSettings(ctx);
    assertSlotAllowed(settings, args.startUtc);
    // DECISION: one active meeting per lead; use Reschedule to move it.
    const existing = await ctx.db.query("meetings").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).collect();
    if (existing.some((m) => ACTIVE.has(m.status))) throw new ConvexError("This lead already has an open meeting — reschedule it instead");
    // Check-and-insert in one transaction: race-safe under Convex OCC.
    if ((await activeCountAt(ctx, args.startUtc)) >= settings.slotCapacity) throw new ConvexError(TAKEN);
    const id = await ctx.db.insert("meetings", {
      leadId: lead._id,
      ownerId: lead.assignedTo ?? user._id,
      startUtc: args.startUtc,
      endUtc: args.startUtc + settings.slotMinutes * 60000,
      clientTimeZone: args.clientTimeZone,
      status: "requested",
      notes: args.notes?.trim().slice(0, 2000) || undefined,
      createdAt: Date.now(),
    });
    await logActivity(ctx, lead._id, user._id, "meeting", { action: "requested", meetingId: id, startUtc: args.startUtc, clientTimeZone: args.clientTimeZone });
    await setLeadStatusKey(ctx, user, lead._id, "meeting_requested");
    return id;
  },
});

async function loadMeetingForEdit(ctx: MutationCtx, user: Doc<"users">, id: Id<"meetings">) {
  const m = await ctx.db.get(id);
  if (!m) throw new ConvexError("Meeting not found");
  if (!isAdmin(user) && m.ownerId !== user._id) throw new ConvexError("Only the meeting owner can change it");
  return m;
}

export const setLink = mutation({
  args: { id: v.id("meetings"), meetLink: v.string() },
  handler: async (ctx, { id, meetLink }) => {
    const user = await requireUser(ctx);
    const m = await loadMeetingForEdit(ctx, user, id);
    const link = meetLink.trim();
    if (!MEET_LINK_RE.test(link)) throw new ConvexError("Use a Google Meet link like https://meet.google.com/abc-defg-hij");
    if (!ACTIVE.has(m.status)) throw new ConvexError("This meeting is closed");
    await ctx.db.patch(id, { meetLink: link, status: "scheduled" });
    await logActivity(ctx, m.leadId, user._id, "meeting", { action: "scheduled", meetingId: id, meetLink: link });
    await setLeadStatusKey(ctx, user, m.leadId, "meeting_scheduled");
  },
});

export const setOutcome = mutation({
  args: { id: v.id("meetings"), status: v.union(v.literal("completed"), v.literal("no_show"), v.literal("cancelled")) },
  handler: async (ctx, { id, status }) => {
    const user = await requireUser(ctx);
    const m = await loadMeetingForEdit(ctx, user, id);
    if (!ACTIVE.has(m.status)) throw new ConvexError("This meeting is already closed");
    if (status !== "cancelled" && m.startUtc > Date.now()) throw new ConvexError("You can mark the outcome once the meeting has started");
    await ctx.db.patch(id, { status }); // cancelled no longer counts toward slot capacity
    await logActivity(ctx, m.leadId, user._id, "meeting", { action: status, meetingId: id });
  },
});

export const reschedule = mutation({
  args: { id: v.id("meetings"), startUtc: v.number(), clientTimeZone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const m = await loadMeetingForEdit(ctx, user, args.id);
    if (!ACTIVE.has(m.status)) throw new ConvexError("This meeting is closed");
    if (args.clientTimeZone) assertTz(args.clientTimeZone);
    const settings = await getSettings(ctx);
    assertSlotAllowed(settings, args.startUtc);
    if ((await activeCountAt(ctx, args.startUtc, m._id)) >= settings.slotCapacity) throw new ConvexError(TAKEN);
    await ctx.db.patch(m._id, {
      startUtc: args.startUtc,
      endUtc: args.startUtc + settings.slotMinutes * 60000,
      ...(args.clientTimeZone ? { clientTimeZone: args.clientTimeZone } : {}),
    });
    await logActivity(ctx, m.leadId, user._id, "meeting", { action: "rescheduled", meetingId: m._id, from: m.startUtc, startUtc: args.startUtc });
  },
});

/** Admin "Remind" on meetings missing a Meet link → in-app notification. */
export const remind = mutation({
  args: { id: v.id("meetings") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx);
    const m = await ctx.db.get(id);
    if (!m) throw new ConvexError("Meeting not found");
    const lead = await ctx.db.get(m.leadId);
    await ctx.db.insert("notifications", {
      userId: m.ownerId,
      message: `${admin.name} asked you to add a Meet link for ${lead ? leadTitle(lead.fields) : "a meeting"}`,
      leadId: m.leadId,
      read: false,
      createdAt: Date.now(),
    });
  },
});
