import { v } from "convex/values";

export const role = v.union(v.literal("admin"), v.literal("member"));
export const themePreference = v.union(v.literal("light"), v.literal("dark"), v.literal("system"));
export const statusKind = v.union(v.literal("open"), v.literal("won"), v.literal("lost"));
export const fieldType = v.union(
  v.literal("text"),
  v.literal("long_text"),
  v.literal("number"),
  v.literal("currency"),
  v.literal("email"),
  v.literal("phone"),
  v.literal("url"),
  v.literal("date"),
  v.literal("single_select"),
  v.literal("multi_select"),
  v.literal("checkbox"),
);
export const fieldOption = v.object({ value: v.string(), label: v.string(), color: v.string() });
export const activityType = v.union(
  v.literal("status"),
  v.literal("assign"),
  v.literal("note"),
  v.literal("meeting"),
  v.literal("field"),
  v.literal("sale"),
);
export const meetingStatus = v.union(
  v.literal("requested"),
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("no_show"),
  v.literal("cancelled"),
);
// DECISION: a third "void" status keeps a record when a Won lead is reopened,
// instead of deleting the pending commission.
export const commissionStatus = v.union(v.literal("pending"), v.literal("paid"), v.literal("void"));
