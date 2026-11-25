import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const DEFAULT_SETTINGS = {
  currency: "INR",
  defaultCommissionRate: 7.5,
  slotCapacity: 1,
  slotMinutes: 30,
  teamTimeZone: "Asia/Kolkata",
  workingHours: { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" },
  blockedDates: [] as string[],
};

export async function getSettings(ctx: QueryCtx | MutationCtx): Promise<Omit<Doc<"settings">, "_id" | "_creationTime">> {
  const s = await ctx.db.query("settings").first();
  return s ?? DEFAULT_SETTINGS;
}

export const SEED_STATUSES = [
  { name: "New", color: "#A1A1AA", kind: "open", key: "new" },
  { name: "Contacted", color: "#3B82F6", kind: "open", key: "contacted" },
  { name: "Interested", color: "#0891B2", kind: "open", key: "interested" },
  { name: "Meeting Requested", color: "#F59E0B", kind: "open", key: "meeting_requested" },
  { name: "Meeting Scheduled", color: "#8B5CF6", kind: "open", key: "meeting_scheduled" },
  { name: "Proposal Sent", color: "#4F46E5", kind: "open", key: "proposal_sent" },
  { name: "Won", color: "#16A34A", kind: "won", key: "won" },
  { name: "Lost", color: "#E11D48", kind: "lost", key: "lost" },
] as const;

export const SEED_FIELDS = [
  { key: "name", label: "Name", type: "text", required: true, showInTable: true },
  { key: "company", label: "Company", type: "text", required: false, showInTable: true },
  { key: "email", label: "Email", type: "email", required: false, showInTable: true },
  { key: "phone", label: "Phone", type: "phone", required: false, showInTable: true },
  { key: "website", label: "Website", type: "url", required: false, showInTable: false },
  { key: "country", label: "Country", type: "text", required: false, showInTable: true },
  {
    key: "source",
    label: "Source",
    type: "single_select",
    required: false,
    showInTable: true,
    options: [
      { value: "linkedin", label: "LinkedIn", color: "#3B82F6" },
      { value: "referral", label: "Referral", color: "#16A34A" },
      { value: "website", label: "Website", color: "#8B5CF6" },
      { value: "cold_email", label: "Cold email", color: "#F59E0B" },
      { value: "event", label: "Event", color: "#E11D48" },
    ],
  },
  { key: "notes", label: "Notes", type: "long_text", required: false, showInTable: false },
] as const;

/** Creates settings, statuses, fields and counters if missing. Idempotent. */
export async function ensureSeeded(ctx: MutationCtx) {
  if (!(await ctx.db.query("settings").first())) {
    await ctx.db.insert("settings", { ...DEFAULT_SETTINGS, workingHours: { ...DEFAULT_SETTINGS.workingHours, days: [...DEFAULT_SETTINGS.workingHours.days] } });
  }
  if (!(await ctx.db.query("statuses").first())) {
    let order = 0;
    for (const s of SEED_STATUSES) await ctx.db.insert("statuses", { ...s, order: order++ });
  }
  if (!(await ctx.db.query("fieldDefinitions").first())) {
    let order = 0;
    for (const f of SEED_FIELDS) {
      await ctx.db.insert("fieldDefinitions", {
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        showInTable: f.showInTable,
        options: "options" in f ? f.options.map((o) => ({ ...o })) : undefined,
        order: order++,
        archived: false,
      });
    }
  }
  if (!(await ctx.db.query("counters").first())) {
    await ctx.db.insert("counters", { total: 0, byStatus: {}, byAssignee: {} });
  }
}

export async function statusByKey(ctx: QueryCtx | MutationCtx, key: string) {
  const all = await ctx.db.query("statuses").collect();
  return all.find((s) => s.key === key) ?? null;
}

export function effectiveRate(user: Doc<"users">, settings: { defaultCommissionRate: number }) {
  return user.commissionRateOverride ?? settings.defaultCommissionRate;
}
