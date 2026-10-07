// Family-local calendar helpers. Every date in the system is a YYYY-MM-DD
// string in the family's timezone; never slice an ISO string for this.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

function parts(now: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) map[p.type] = p.value;
  return map;
}

/** YYYY-MM-DD for `now` in the given timezone. */
export function localDate(timeZone: string, now: Date = new Date()): string {
  const p = parts(now, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since local midnight for `now` in the given timezone. */
export function localMinutes(timeZone: string, now: Date = new Date()): number {
  const p = parts(now, timeZone);
  // Intl can render midnight as "24" in some engines.
  const hour = Number(p.hour) % 24;
  return hour * 60 + Number(p.minute);
}

/** "08:15" → 495. Tolerates "8:15". */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** Weekday 0 (Sunday) to 6 (Saturday) for a YYYY-MM-DD string. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const w = weekdayOf(date);
  return w === 0 || w === 6;
}

/** The YYYY-MM-DD `days` days before (negative) or after `date`. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
