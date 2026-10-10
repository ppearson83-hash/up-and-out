// Pure scheduling rules: which routines and jobs apply on a given date, the
// state of a routine at a given time, and the "(Tue)" / "(14 Oct)" suffix
// parents type after a job to limit it to days or a single date.
import { addDays, hhmmToMinutes, weekdayOf } from "@/lib/dates";

export type RoutineLike = { days: number[]; startTime: string; endTime: string };
export type TaskLike = { days: number[]; date: string | null; active?: boolean };

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isTaskScheduled(task: TaskLike, routine: RoutineLike, date: string): boolean {
  if (task.active === false) return false;
  if (task.date) return task.date === date;
  const w = weekdayOf(date);
  // A job's own days only narrow the routine's days, never extend them.
  if (!routine.days.includes(w)) return false;
  return task.days.length === 0 || task.days.includes(w);
}

/** A routine runs today if it is a routine day or it has a one-off job dated today. */
export function isRoutineScheduled(routine: RoutineLike & { tasks: TaskLike[] }, date: string): boolean {
  return routine.days.includes(weekdayOf(date)) || routine.tasks.some((t) => t.active !== false && t.date === date);
}

export type RoutineStatus = "upcoming" | "live" | "over";

export function routineStatus(routine: RoutineLike, nowMinutes: number): RoutineStatus {
  const s = hhmmToMinutes(routine.startTime), e = hhmmToMinutes(routine.endTime);
  if (nowMinutes < s) return "upcoming";
  if (nowMinutes < e) return "live";
  return "over";
}

/* ---------- job line suffix: "Swimming kit (Tue)", "Spellings (Mon, Thu)", "Dentist form (14 Oct)" ---------- */

export type ParsedTask = { label: string; days: number[]; date: string | null };

const SUFFIX = /^(.*?)\s*\(([^()]+)\)\s*$/;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MONTH = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*(?:\s+(\d{4}))?$/;

function parseDate(text: string, today: string): string | null {
  const iso = ISO.exec(text);
  if (iso) return text;
  const dm = DAY_MONTH.exec(text);
  if (!dm) return null;
  const day = Number(dm[1]);
  const month = MONTHS.findIndex((m) => m.toLowerCase() === dm[2].toLowerCase());
  if (month < 0 || day < 1 || day > 31) return null;
  const [ty] = today.split("-").map(Number);
  let year = dm[3] ? Number(dm[3]) : ty;
  const fmt = (y: number) => `${y}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Without a year: the next occurrence, so "14 Oct" typed in December means next year.
  if (!dm[3] && fmt(year) < today) year += 1;
  return fmt(year);
}

export function parseTaskLine(line: string, today: string): ParsedTask | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const m = SUFFIX.exec(trimmed);
  if (!m || !m[1].trim()) return { label: trimmed, days: [], date: null };
  const label = m[1].trim(), inner = m[2].trim();
  const date = parseDate(inner, today);
  if (date) return { label, days: [], date };
  const parts = inner.split(/[,\s/]+/).filter(Boolean);
  const days = parts.map((p) => DAY_NAMES.findIndex((d) => d.toLowerCase() === p.slice(0, 3).toLowerCase()));
  if (parts.length && days.every((d) => d >= 0)) return { label, days: [...new Set(days)].sort(), date: null };
  // Not a schedule suffix: keep the brackets as part of the label.
  return { label: trimmed, days: [], date: null };
}

/** "14 Oct", or "14 Oct 2027" when the year is not `today`'s, so the line re-parses to the same date. */
export function formatDateSuffix(date: string, today?: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const sameYear = today ? today.startsWith(String(y)) : true;
  return `${d} ${MONTHS[m - 1]}${sameYear ? "" : ` ${y}`}`;
}

export function formatTaskLine(task: { label: string; days: number[]; date: string | null }, today?: string): string {
  if (task.date) return `${task.label} (${formatDateSuffix(task.date, today)})`;
  if (task.days.length) return `${task.label} (${task.days.map((d) => DAY_NAMES[d]).join(", ")})`;
  return task.label;
}

/** The next `n` dates from `from` inclusive. */
export function dateRange(from: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(from, i));
}
