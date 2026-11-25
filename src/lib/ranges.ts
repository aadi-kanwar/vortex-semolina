import { addDays, addMonths, endOfDay, startOfDay, startOfMonth, startOfWeek, subDays } from "date-fns";

export type RangeKey = "week" | "month" | "30d" | "custom";

export interface Range {
  key: RangeKey;
  start: number;
  end: number;
  prevStart: number;
  prevEnd: number;
  label: string;
}

// DECISION: ranges are computed in the viewer's browser time zone; weeks start Monday.
export function computeRange(key: RangeKey, custom?: { from: string; to: string }): Range {
  const now = new Date();
  if (key === "week") {
    const s = startOfWeek(now, { weekStartsOn: 1 });
    const e = addDays(s, 7);
    return { key, start: +s, end: +e, prevStart: +addDays(s, -7), prevEnd: +s, label: "this week" };
  }
  if (key === "30d") {
    const e = endOfDay(now);
    const s = startOfDay(subDays(now, 29));
    const len = +e - +s;
    return { key, start: +s, end: +e, prevStart: +s - len, prevEnd: +s, label: "last 30 days" };
  }
  if (key === "custom" && custom?.from && custom?.to) {
    const s = startOfDay(new Date(custom.from + "T00:00:00"));
    const e = endOfDay(new Date(custom.to + "T00:00:00"));
    const len = Math.max(86400000, +e - +s);
    return { key, start: +s, end: +e, prevStart: +s - len, prevEnd: +s, label: "this period" };
  }
  const s = startOfMonth(now);
  const e = addMonths(s, 1);
  return { key: "month", start: +s, end: +e, prevStart: +addMonths(s, -1), prevEnd: +s, label: "this month" };
}

export function thisWeek() {
  const s = startOfWeek(new Date(), { weekStartsOn: 1 });
  return { weekStart: +s, weekEnd: +addDays(s, 7) };
}
