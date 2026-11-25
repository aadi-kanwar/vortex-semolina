import { ConvexError } from "convex/values";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getSettings } from "./settings";
import { hhmmToMinutes } from "./shared";

type Settings = Awaited<ReturnType<typeof getSettings>>;

/** Throws a user-facing error if `startUtc` is not a bookable slot. */
export function assertSlotAllowed(settings: Settings, startUtc: number) {
  const tz = settings.teamTimeZone;
  const minutes = Number(formatInTimeZone(startUtc, tz, "H")) * 60 + Number(formatInTimeZone(startUtc, tz, "m"));
  const slot = settings.slotMinutes;
  if (startUtc % 60000 !== 0 || minutes % slot !== 0) throw new ConvexError(`Meetings start on :00 or :30`);
  if (startUtc <= Date.now()) throw new ConvexError("That slot is in the past");
  const day = Number(formatInTimeZone(startUtc, tz, "i")) % 7; // ISO 1..7 → 0 = Sunday
  const date = formatInTimeZone(startUtc, tz, "yyyy-MM-dd");
  const { days, start, end } = settings.workingHours;
  if (!days.includes(day) || minutes < hhmmToMinutes(start) || minutes + slot > hhmmToMinutes(end)) {
    throw new ConvexError("That time is outside working hours");
  }
  if (settings.blockedDates.includes(date)) throw new ConvexError("That date is blocked");
}

export async function activeCountAt(ctx: QueryCtx | MutationCtx, startUtc: number, excludeId?: Id<"meetings">) {
  const [req, sch] = await Promise.all([
    ctx.db.query("meetings").withIndex("by_start_status", (q) => q.eq("startUtc", startUtc).eq("status", "requested")).collect(),
    ctx.db.query("meetings").withIndex("by_start_status", (q) => q.eq("startUtc", startUtc).eq("status", "scheduled")).collect(),
  ]);
  return [...req, ...sch].filter((m) => m._id !== excludeId).length;
}

/** All slot starts (UTC ms) on a team-time-zone date, within working hours. */
export function slotsForDate(settings: Settings, date: string): number[] {
  const { days, start, end } = settings.workingHours;
  const tz = settings.teamTimeZone;
  const noon = fromZonedTime(`${date}T12:00:00`, tz).getTime();
  const day = Number(formatInTimeZone(noon, tz, "i")) % 7;
  if (!days.includes(day) || settings.blockedDates.includes(date)) return [];
  const out: number[] = [];
  for (let m = hhmmToMinutes(start); m + settings.slotMinutes <= hhmmToMinutes(end); m += settings.slotMinutes) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    out.push(fromZonedTime(`${date}T${hh}:${mm}:00`, tz).getTime());
  }
  return out;
}
