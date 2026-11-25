import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  activityType,
  commissionStatus,
  fieldOption,
  fieldType,
  meetingStatus,
  role,
  statusKind,
  themePreference,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    role,
    active: v.boolean(),
    commissionRateOverride: v.optional(v.number()),
    themePreference: v.optional(themePreference),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  fieldDefinitions: defineTable({
    key: v.string(),
    label: v.string(),
    type: fieldType,
    options: v.optional(v.array(fieldOption)),
    required: v.boolean(),
    showInTable: v.boolean(),
    order: v.number(),
    archived: v.boolean(),
  })
    .index("by_key", ["key"])
    .index("by_order", ["order"]),

  statuses: defineTable({
    name: v.string(),
    color: v.string(),
    kind: statusKind,
    order: v.number(),
    // DECISION: seeded statuses carry a stable `key` so automation (meeting flow,
    // "contacted" KPI, saved views) keeps working after admins rename them.
    key: v.optional(v.string()),
  }).index("by_order", ["order"]),

  leads: defineTable({
    fields: v.record(v.string(), v.any()),
    statusId: v.id("statuses"),
    assignedTo: v.optional(v.id("users")),
    saleAmount: v.optional(v.number()),
    lostReason: v.optional(v.string()),
    nextFollowUpAt: v.optional(v.number()),
    lastActivityAt: v.number(),
    lastNote: v.optional(v.string()),
    wonAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    // DECISION: dedupe uses two normalized keys (email + phone) instead of one
    // combined `dedupeKey`, so "email OR phone matches" is two index lookups.
    emailKey: v.optional(v.string()),
    phoneKey: v.optional(v.string()),
    searchText: v.string(),
  })
    .index("by_assignee", ["assignedTo"])
    .index("by_status", ["statusId"])
    .index("by_assignee_status", ["assignedTo", "statusId"])
    .index("by_assignee_activity", ["assignedTo", "lastActivityAt"])
    .index("by_assignee_followup", ["assignedTo", "nextFollowUpAt"])
    .index("by_activity", ["lastActivityAt"])
    .index("by_followup", ["nextFollowUpAt"])
    .index("by_emailKey", ["emailKey"])
    .index("by_phoneKey", ["phoneKey"])
    .index("by_wonAt", ["wonAt"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["statusId", "assignedTo"],
    }),

  activities: defineTable({
    leadId: v.id("leads"),
    actorId: v.id("users"),
    type: activityType,
    payload: v.any(),
    createdAt: v.number(),
  })
    .index("by_lead", ["leadId", "createdAt"])
    .index("by_actor", ["actorId", "createdAt"])
    .index("by_type", ["type", "createdAt"]),

  meetings: defineTable({
    leadId: v.id("leads"),
    ownerId: v.id("users"),
    startUtc: v.number(),
    endUtc: v.number(),
    clientTimeZone: v.string(),
    status: meetingStatus,
    meetLink: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_start_status", ["startUtc", "status"])
    .index("by_owner", ["ownerId", "startUtc"])
    .index("by_lead", ["leadId"])
    .index("by_status", ["status", "startUtc"]),

  commissions: defineTable({
    leadId: v.id("leads"),
    leadName: v.string(),
    userId: v.id("users"),
    saleAmount: v.number(),
    rate: v.number(),
    amount: v.number(),
    currency: v.string(),
    status: commissionStatus,
    createdAt: v.number(),
    paidAt: v.optional(v.number()),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_lead", ["leadId"])
    .index("by_created", ["createdAt"]),

  settings: defineTable({
    currency: v.string(),
    defaultCommissionRate: v.number(),
    slotCapacity: v.number(),
    slotMinutes: v.number(),
    teamTimeZone: v.string(),
    workingHours: v.object({
      days: v.array(v.number()), // 0 = Sunday … 6 = Saturday
      start: v.string(), // "09:00"
      end: v.string(), // "18:00"
    }),
    blockedDates: v.array(v.string()), // "yyyy-MM-dd" in team time zone
  }),

  // DECISION: one counters doc, kept in sync by convex/lib/leads.ts, so the
  // sidebar count, dashboards and funnel never scan 10k+ leads.
  counters: defineTable({
    total: v.number(),
    byStatus: v.record(v.string(), v.number()),
    byAssignee: v.record(v.string(), v.number()), // "unassigned" or user id
  }),

  // DECISION: "Remind" on the admin dashboard writes an in-app notification
  // (bell in the sidebar). No email.
  notifications: defineTable({
    userId: v.id("users"),
    message: v.string(),
    leadId: v.optional(v.id("leads")),
    read: v.boolean(),
    createdAt: v.number(),
  }).index("by_user", ["userId", "read", "createdAt"]),
});
