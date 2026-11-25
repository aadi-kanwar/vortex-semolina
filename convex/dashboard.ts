import { v } from "convex/values";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/auth";
import { effectiveRate, getSettings } from "./lib/settings";
import { leadTitle } from "./lib/shared";

const rangeArgs = {
  start: v.number(),
  end: v.number(),
  prevStart: v.number(),
  prevEnd: v.number(),
  todayEnd: v.number(),
};

const DAY = 86400000;
const inRange = (t: number | undefined, a: number, b: number) => t !== undefined && t >= a && t < b;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

async function statusMap(ctx: QueryCtx) {
  const statuses = await ctx.db.query("statuses").withIndex("by_order").collect();
  return { statuses, byId: new Map(statuses.map((s) => [s._id, s])) };
}

/** "Contacted" = status changes away from the New status (first touch). */
async function contactedByActor(ctx: QueryCtx, a: number, b: number) {
  const acts = await ctx.db.query("activities").withIndex("by_type", (q) => q.eq("type", "status").gte("createdAt", a).lt("createdAt", b)).collect();
  const out = new Map<string, number>();
  for (const x of acts) if (x.payload?.fromKey === "new") out.set(x.actorId, (out.get(x.actorId) ?? 0) + 1);
  return out;
}

async function meetingsStarting(ctx: QueryCtx, a: number, b: number) {
  const ms = await ctx.db.query("meetings").withIndex("by_start_status", (q) => q.gte("startUtc", a).lt("startUtc", b)).collect();
  return ms.filter((m) => m.status !== "cancelled");
}

async function wonLeads(ctx: QueryCtx, a: number, b: number) {
  return await ctx.db.query("leads").withIndex("by_wonAt", (q) => q.gte("wonAt", a).lt("wonAt", b)).collect();
}

async function withLead<T extends { leadId: Id<"leads"> }>(ctx: QueryCtx, rows: T[]) {
  return await Promise.all(
    rows.map(async (r) => {
      const lead = await ctx.db.get(r.leadId);
      return {
        ...r,
        leadName: lead ? leadTitle(lead.fields) : "Deleted lead",
        company: lead?.fields.company as string | undefined,
        country: lead?.fields.country as string | undefined,
        city: lead?.fields.city as string | undefined,
      };
    }),
  );
}

export const member = query({
  args: rangeArgs,
  handler: async (ctx, r) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    const settings = await getSettings(ctx);
    const { statuses, byId } = await statusMap(ctx);

    // My leads (indexed; a member typically owns hundreds, not thousands).
    const myLeads = await ctx.db.query("leads").withIndex("by_assignee", (q) => q.eq("assignedTo", me._id)).collect();
    const myComms = (await ctx.db.query("commissions").withIndex("by_user", (q) => q.eq("userId", me._id)).collect()).filter((c) => c.status !== "void");
    const myMeetings = await ctx.db.query("meetings").withIndex("by_owner", (q) => q.eq("ownerId", me._id)).collect();
    const [contacted, contactedPrev] = await Promise.all([contactedByActor(ctx, r.start, r.end), contactedByActor(ctx, r.prevStart, r.prevEnd)]);

    const earned = myComms.filter((c) => inRange(c.createdAt, r.start, r.end));
    const pending = myComms.filter((c) => c.status === "pending");
    const paid = myComms.filter((c) => c.status === "paid");
    const lastPaidAt = Math.max(0, ...paid.map((c) => c.paidAt ?? 0));
    const lastPayoutDay = lastPaidAt ? formatInTimeZone(lastPaidAt, settings.teamTimeZone, "yyyy-MM-dd") : null;
    const lastPayout = lastPayoutDay
      ? sum(paid.filter((c) => c.paidAt && formatInTimeZone(c.paidAt, settings.teamTimeZone, "yyyy-MM-dd") === lastPayoutDay).map((c) => c.amount))
      : 0;

    const booked = myMeetings.filter((m) => m.status !== "cancelled" && inRange(m.startUtc, r.start, r.end)).length;
    const bookedPrev = myMeetings.filter((m) => m.status !== "cancelled" && inRange(m.startUtc, r.prevStart, r.prevEnd)).length;
    const won = myLeads.filter((l) => inRange(l.wonAt, r.start, r.end)).length;
    const wonPrev = myLeads.filter((l) => inRange(l.wonAt, r.prevStart, r.prevEnd)).length;
    const newLeads = myLeads.filter((l) => inRange(l.createdAt, r.start, r.end)).length;

    const pipeline = statuses.map((s) => ({ statusId: s._id, name: s.name, color: s.color, count: myLeads.filter((l) => l.statusId === s._id).length }));

    const upcoming = await withLead(
      ctx,
      myMeetings
        .filter((m) => (m.status === "requested" || m.status === "scheduled") && m.endUtc > now)
        .sort((a, b) => a.startUtc - b.startUtc)
        .slice(0, 5),
    );
    const needsLink = myMeetings.filter((m) => m.status === "requested" && m.endUtc > now).length;

    const isOpen = (l: Doc<"leads">) => byId.get(l.statusId)?.kind === "open";
    const followUps = myLeads
      .filter((l) => l.nextFollowUpAt !== undefined && l.nextFollowUpAt <= r.todayEnd && isOpen(l))
      .sort((a, b) => a.nextFollowUpAt! - b.nextFollowUpAt!);
    const cold = myLeads
      .filter((l) => isOpen(l) && l.lastActivityAt < now - 7 * DAY)
      .sort((a, b) => a.lastActivityAt - b.lastActivityAt);

    const recent = await withLead(ctx, await ctx.db.query("activities").withIndex("by_actor", (q) => q.eq("actorId", me._id)).order("desc").take(8));

    const slim = (l: Doc<"leads">) => ({ _id: l._id, name: leadTitle(l.fields), company: l.fields.company as string | undefined, statusId: l.statusId, lastNote: l.lastNote, nextFollowUpAt: l.nextFollowUpAt, lastActivityAt: l.lastActivityAt });

    return {
      currency: settings.currency,
      teamTimeZone: settings.teamTimeZone,
      rate: effectiveRate(me, settings),
      commission: {
        earned: sum(earned.map((c) => c.amount)),
        earnedDeals: earned.length,
        earnedSales: sum(earned.map((c) => c.saleAmount)),
        pending: sum(pending.map((c) => c.amount)),
        pendingDeals: pending.length,
        paid: sum(paid.map((c) => c.amount)),
        lastPayout,
        lastPaidAt: lastPaidAt || null,
      },
      kpis: {
        myLeads: myLeads.length,
        newLeads,
        contacted: contacted.get(me._id) ?? 0,
        contactedPrev: contactedPrev.get(me._id) ?? 0,
        booked,
        bookedPrev,
        won,
        wonPrev,
        winRate: booked ? won / booked : null,
        winRatePrev: bookedPrev ? wonPrev / bookedPrev : null,
      },
      pipeline,
      upcoming,
      needsLink,
      followUpsDue: followUps.length,
      followUps: followUps.slice(0, 6).map(slim),
      cold: cold.slice(0, 6).map(slim),
      recent,
    };
  },
});

export const admin = query({
  args: { ...rangeArgs, weekStart: v.number(), weekEnd: v.number(), memberId: v.optional(v.id("users")) },
  handler: async (ctx, r) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const settings = await getSettings(ctx);
    const { statuses, byId } = await statusMap(ctx);
    const counters = (await ctx.db.query("counters").first()) ?? { total: 0, byStatus: {}, byAssignee: {} as Record<string, number> };
    const users = await ctx.db.query("users").collect();
    const mid = r.memberId;
    const forMember = <T>(xs: T[], key: (x: T) => string | undefined) => (mid ? xs.filter((x) => key(x) === mid) : xs);

    const [contacted, weekMeetings, periodMeetings, won, wonPrev, pendingAll, periodComms] = await Promise.all([
      contactedByActor(ctx, r.start, r.end),
      meetingsStarting(ctx, r.weekStart, r.weekEnd),
      meetingsStarting(ctx, r.start, r.end),
      wonLeads(ctx, r.start, r.end),
      wonLeads(ctx, r.prevStart, r.prevEnd),
      ctx.db.query("commissions").withIndex("by_status", (q) => q.eq("status", "pending")).collect(),
      ctx.db.query("commissions").withIndex("by_created", (q) => q.gte("createdAt", r.start).lt("createdAt", r.end)).collect(),
    ]);

    const wk = forMember(weekMeetings, (m) => m.ownerId);
    const wonM = forMember(won, (l) => l.assignedTo);
    const wonPrevM = forMember(wonPrev, (l) => l.assignedTo);
    const pendingM = forMember(pendingAll, (c) => c.userId);

    // Leaderboard: everyone who is active or still owns leads.
    const leaderboard = users
      .filter((u) => u.active || (counters.byAssignee[u._id] ?? 0) > 0)
      .map((u) => {
        const uWon = won.filter((l) => l.assignedTo === u._id);
        return {
          userId: u._id,
          name: u.name,
          avatarUrl: u.avatarUrl,
          active: u.active,
          leads: counters.byAssignee[u._id] ?? 0,
          contacted: contacted.get(u._id) ?? 0,
          meetings: periodMeetings.filter((m) => m.ownerId === u._id).length,
          won: uWon.length,
          revenue: sum(uWon.map((l) => l.saleAmount ?? 0)),
          rate: effectiveRate(u, settings),
          isOverride: u.commissionRateOverride !== undefined,
          commission: sum(periodComms.filter((c) => c.userId === u._id && c.status !== "void").map((c) => c.amount)),
          pending: sum(pendingAll.filter((c) => c.userId === u._id).map((c) => c.amount)),
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.won - a.won || a.name.localeCompare(b.name));

    // Funnel: open stages in order, then won. "Reached" = at this stage or later.
    let stageCounts: Record<string, number> = counters.byStatus;
    if (mid) {
      const mine = await ctx.db.query("leads").withIndex("by_assignee", (q) => q.eq("assignedTo", mid)).collect();
      stageCounts = {};
      for (const l of mine) stageCounts[l.statusId] = (stageCounts[l.statusId] ?? 0) + 1;
    }
    const stages = statuses.filter((s) => s.kind !== "lost");
    // DECISION: funnel conversion = leads that reached stage N (now at N or later) ÷ those that reached N-1.
    const reached = stages.map((_, i) => sum(stages.slice(i).map((s) => stageCounts[s._id] ?? 0)));
    const funnel = stages.map((s, i) => ({
      statusId: s._id,
      name: s.name,
      color: s.color,
      count: stageCounts[s._id] ?? 0,
      reached: reached[i],
      conversion: i === 0 ? null : reached[i - 1] ? reached[i] / reached[i - 1] : null,
    }));

    // Won revenue, last 6 months in the team time zone.
    const tz = settings.teamTimeZone;
    const thisMonth = formatInTimeZone(now, tz, "yyyy-MM");
    const months: string[] = [];
    {
      let [y, m] = thisMonth.split("-").map(Number);
      for (let i = 0; i < 6; i++) {
        months.unshift(`${y}-${String(m).padStart(2, "0")}`);
        m--;
        if (m === 0) {
          m = 12;
          y--;
        }
      }
    }
    const sixStart = fromZonedTime(`${months[0]}-01T00:00:00`, tz).getTime();
    const sixWon = forMember(await wonLeads(ctx, sixStart, now + DAY), (l) => l.assignedTo);
    const revenueByMonth = months.map((mo) => ({
      month: mo,
      revenue: sum(sixWon.filter((l) => formatInTimeZone(l.wonAt!, tz, "yyyy-MM") === mo).map((l) => l.saleAmount ?? 0)),
    }));

    const missing = await ctx.db.query("meetings").withIndex("by_status", (q) => q.eq("status", "requested").gte("startUtc", now - DAY)).take(50);
    const missingRows = await withLead(ctx, forMember(missing, (m) => m.ownerId).slice(0, 8));

    const total = mid ? counters.byAssignee[mid] ?? 0 : counters.total;
    return {
      currency: settings.currency,
      defaultRate: settings.defaultCommissionRate,
      memberCount: users.filter((u) => u.active).length,
      kpis: {
        total,
        assigned: mid ? total : counters.total - (counters.byAssignee["unassigned"] ?? 0),
        unassigned: counters.byAssignee["unassigned"] ?? 0,
        meetingsWeek: wk.length,
        missingLinkWeek: wk.filter((m) => m.status === "requested").length,
        revenue: sum(wonM.map((l) => l.saleAmount ?? 0)),
        revenuePrev: sum(wonPrevM.map((l) => l.saleAmount ?? 0)),
        wonCount: wonM.length,
        payable: sum(pendingM.map((c) => c.amount)),
        payableCount: pendingM.length,
      },
      leaderboard: mid ? leaderboard.filter((l) => l.userId === mid) : leaderboard,
      funnel,
      revenueByMonth,
      missing: missingRows,
      statusKinds: Object.fromEntries([...byId].map(([k, s]) => [k, s.kind])),
    };
  },
});
