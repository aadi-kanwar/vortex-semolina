import { fromZonedTime } from "date-fns-tz";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { createCommission } from "./lib/commissions";
import { activeFieldDefs, insertLeads, logActivity, rebuildCounters } from "./lib/leads";
import { ensureSeeded, getSettings } from "./lib/settings";
import { slotsForDate } from "./lib/slots";

/**
 * `npx convex run seed:run` — 2 demo members, 50 leads across statuses,
 * a few meetings and one Won lead with a commission. Safe to run once;
 * it refuses if demo data already exists.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ensureSeeded(ctx);
    if (await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", "seed_priya")).unique()) {
      return "Seed data already present";
    }
    const priya = await ctx.db.insert("users", { clerkId: "seed_priya", name: "Priya Sharma", email: "priya@example.com", role: "member", active: true, themePreference: "system" });
    const arjun = await ctx.db.insert("users", { clerkId: "seed_arjun", name: "Arjun Mehta", email: "arjun@example.com", role: "member", active: true, themePreference: "system", commissionRateOverride: 10 });
    const members = [priya, arjun];

    const statuses = await ctx.db.query("statuses").withIndex("by_order").collect();
    const byKey = (k: string) => statuses.find((s) => s.key === k)!;
    if (!(await ctx.db.query("fieldDefinitions").withIndex("by_key", (q) => q.eq("key", "city")).unique())) {
      const max = (await ctx.db.query("fieldDefinitions").collect()).reduce((m, d) => Math.max(m, d.order), 0);
      await ctx.db.insert("fieldDefinitions", { key: "city", label: "City", type: "text", required: false, showInTable: false, order: max + 1, archived: false });
    }
    const defs = await activeFieldDefs(ctx);

    const first = ["Olivia", "Liam", "Emma", "Noah", "Ava", "Lukas", "Mia", "Jack", "Sophie", "Ethan", "Hannah", "Oscar", "Chloe", "Felix", "Grace", "Max", "Isla", "Leon", "Ruby", "Henry", "Zoe", "Jonas", "Amelia", "Lucas", "Ella"];
    const last = ["Smith", "Müller", "Brown", "Wilson", "Taylor", "Schmidt", "Johnson", "Clarke", "Walker", "Fischer"];
    const places = [
      { country: "Australia", city: "Sydney" },
      { country: "United States", city: "New York" },
      { country: "United Kingdom", city: "London" },
      { country: "Germany", city: "Berlin" },
      { country: "Australia", city: "Melbourne" },
      { country: "United States", city: "Austin" },
    ];
    const companies = ["Northwind", "Acme Labs", "Bluepeak", "Kestrel", "Lumen Health", "Orbital", "Paperleaf", "Quartz & Co", "Ridgeway", "Solace", "Tandem", "Vireo"];
    const sources = ["linkedin", "referral", "website", "cold_email", "event"];
    const plan = ["new", "new", "new", "contacted", "contacted", "interested", "interested", "meeting_requested", "meeting_scheduled", "proposal_sent", "lost"];

    const now = Date.now();
    const DAY = 86400000;
    const rows = Array.from({ length: 50 }, (_, i) => {
      const name = `${first[i % first.length]} ${last[(i * 7) % last.length]}`;
      const company = companies[i % companies.length];
      const place = places[i % places.length];
      const key = i === 0 ? "won" : plan[i % plan.length];
      const assignedTo = i % 5 === 4 ? undefined : members[i % 2];
      const createdAt = now - (60 - i) * DAY;
      return {
        fields: {
          name,
          company,
          email: `${name.split(" ")[0].toLowerCase()}.${i}@${company.toLowerCase().replace(/[^a-z]/g, "")}.com`,
          phone: `+1 555 01${String(i).padStart(2, "0")}`,
          country: place.country,
          city: place.city,
          source: sources[i % sources.length],
        },
        statusId: byKey(key)._id,
        assignedTo: key === "new" && i % 3 === 0 ? undefined : assignedTo,
        lastActivityAt: now - (i % 15) * DAY,
        nextFollowUpAt: i % 6 === 1 ? now - (i % 3) * DAY : undefined,
        lastNote: i % 6 === 1 ? "Asked to reconnect after their board meeting." : undefined,
        createdBy: members[0],
        createdAt,
        ...(key === "won" ? { saleAmount: 190000, wonAt: now - 3 * DAY } : {}),
        ...(key === "lost" ? { lostReason: "Went with a competitor" } : {}),
      };
    });
    // The Won lead belongs to Priya so the commission has an owner.
    rows[0].assignedTo = priya;
    const ids = await insertLeads(ctx, defs, rows);
    for (let i = 0; i < ids.length; i++) {
      await logActivity(ctx, ids[i], members[0], "field", { created: true });
      if (rows[i].assignedTo) await logActivity(ctx, ids[i], rows[i].assignedTo as Id<"users">, "assign", { from: null, to: rows[i].assignedTo });
    }
    const wonLead = (await ctx.db.get(ids[0]))!;
    await createCommission(ctx, wonLead, 190000, priya);

    // Meetings on the next working days, first free slots.
    const settings = await getSettings(ctx);
    const meetingLeads = rows
      .map((r, i) => ({ r, id: ids[i] }))
      .filter(({ r }) => r.statusId === byKey("meeting_requested")._id || r.statusId === byKey("meeting_scheduled")._id)
      .slice(0, 6);
    const tzs: Record<string, string> = { Australia: "Australia/Sydney", "United States": "America/New_York", "United Kingdom": "Europe/London", Germany: "Europe/Berlin" };
    let dayOffset = 1;
    let slotIdx = 2;
    for (const { r, id } of meetingLeads) {
      let slots: number[] = [];
      while (slots.length === 0 && dayOffset < 30) {
        const date = new Date(now + dayOffset * DAY).toISOString().slice(0, 10);
        slots = slotsForDate(settings, date).filter((s) => s > now);
        if (slots.length === 0) dayOffset++;
      }
      const startUtc = slots[slotIdx % slots.length] ?? fromZonedTime(new Date(now + DAY).toISOString().slice(0, 10) + "T10:00:00", settings.teamTimeZone).getTime();
      const scheduled = r.statusId === byKey("meeting_scheduled")._id;
      const owner = (r.assignedTo ?? members[0]) as Id<"users">;
      if (!r.assignedTo) await ctx.db.patch(id, { assignedTo: owner });
      await ctx.db.insert("meetings", {
        leadId: id,
        ownerId: owner,
        startUtc,
        endUtc: startUtc + settings.slotMinutes * 60000,
        clientTimeZone: tzs[r.fields.country] ?? "UTC",
        status: scheduled ? "scheduled" : "requested",
        meetLink: scheduled ? "https://meet.google.com/abc-defg-hij" : undefined,
        createdAt: now - DAY,
      });
      await logActivity(ctx, id, owner, "meeting", { action: "requested", startUtc });
      slotIdx += 3;
      if (slotIdx > 12) {
        slotIdx = 2;
        dayOffset++;
      }
    }
    await rebuildCounters(ctx);
    return "Seeded 2 members, 50 leads, meetings and 1 commission";
  },
});
