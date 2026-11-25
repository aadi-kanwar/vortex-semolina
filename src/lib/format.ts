import { formatDistanceToNowStrict } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const fmtCache = new Map<string, Intl.NumberFormat>();
export function money(amount: number | undefined | null, currency = "INR") {
  if (amount === undefined || amount === null) return "—";
  let f = fmtCache.get(currency);
  if (!f) {
    // Indian digit grouping (₹1,86,000) per spec, whatever the currency.
    f = new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 });
    fmtCache.set(currency, f);
  }
  return f.format(amount);
}

export function lakh(amount: number, currency = "INR") {
  if (currency !== "INR") return money(amount, currency);
  return `₹${(amount / 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })}L`;
}

export function pct(x: number | null | undefined, digits = 0) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function tzLabel(tz: string, at = Date.now()) {
  const abbr = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
  return abbr ?? tz;
}

export function timeIn(ms: number, tz: string, pattern = "h:mm a") {
  return formatInTimeZone(ms, tz, pattern);
}

export function relative(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 60000) return "just now";
  return formatDistanceToNowStrict(ms, { addSuffix: true });
}

export function cityFromTz(tz: string) {
  return tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
}

export const COMMON_TIMEZONES = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "UTC",
];

export function allTimezones(): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
    return [...COMMON_TIMEZONES, ...all.filter((t) => !COMMON_TIMEZONES.includes(t))];
  } catch {
    return COMMON_TIMEZONES;
  }
}
