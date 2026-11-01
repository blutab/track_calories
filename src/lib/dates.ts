/** Dates are plain "YYYY-MM-DD" strings in the app's time zone (default Europe/Amsterdam). */

export const TIME_ZONE = process.env.APP_TIME_ZONE || "Europe/Amsterdam";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !ISO_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function todayIso(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function currentHour(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now),
  );
}

function toUtc(s: string): Date {
  return new Date(s + "T00:00:00Z");
}

export function addDays(s: string, n: number): string {
  const d = toUtc(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `s`. */
export function mondayOf(s: string): string {
  const wd = (toUtc(s).getUTCDay() + 6) % 7;
  return addDays(s, -wd);
}

export function formatDate(s: string, opts: Intl.DateTimeFormatOptions): string {
  return toUtc(s).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

export function resolveDate(s: string | undefined | null): string {
  if (s == null || s === "" || s === "today") return todayIso();
  if (s === "yesterday") return addDays(todayIso(), -1);
  if (!isIsoDate(s)) throw new Error(`Invalid date "${s}". Use YYYY-MM-DD.`);
  return s;
}
