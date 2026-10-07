// Pure reward rules. No database, no clock: callers pass the ledger rows
// and the dates, so every rule is unit-testable and the same code answers
// "what is the balance" everywhere.
import { addDays, isWeekend } from "@/lib/dates";

export type LedgerKind = "task" | "all_done" | "streak" | "claim" | "adjust";

export type Entry = {
  date: string;
  kind: LedgerKind;
  amount: number;
};

export type RewardRules = {
  tokenPerTask: number;
  allDoneBonus: number;
  streakLength: number;
  streakBonus: number;
  schoolDaysOnly: boolean;
};

export function balance(entries: Entry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

/** Dates (unique, ascending) on which the kid finished everything. */
export function allDoneDates(entries: Entry[]): string[] {
  const set = new Set(entries.filter((e) => e.kind === "all_done").map((e) => e.date));
  return [...set].sort();
}

export type StreakRun = { length: number; start: string | null };

/**
 * The run of consecutive counted days, ending on `today` (or on the most
 * recent counted day before it, if today is not finished yet), on which
 * everything was finished. With schoolDaysOnly, weekends are skipped rather
 * than breaking the run. `start` is the earliest date in the run.
 */
export function streakRun(entries: Entry[], today: string, rules: Pick<RewardRules, "schoolDaysOnly">): StreakRun {
  const done = new Set(allDoneDates(entries));
  const none = { length: 0, start: null };
  if (done.size === 0) return none;
  const counts = (d: string) => !(rules.schoolDaysOnly && isWeekend(d));

  let cursor = today;
  if (!done.has(cursor)) {
    cursor = addDays(cursor, -1);
    while (!counts(cursor)) cursor = addDays(cursor, -1);
    if (!done.has(cursor)) return none;
  }
  let n = 0, start: string | null = null;
  for (let guard = 0; guard < 400; guard++) {
    if (counts(cursor)) {
      if (!done.has(cursor)) break;
      n++; start = cursor;
    }
    cursor = addDays(cursor, -1);
  }
  return { length: n, start };
}

export function streak(entries: Entry[], today: string, rules: Pick<RewardRules, "schoolDaysOnly">): number {
  return streakRun(entries, today, rules).length;
}

/**
 * True when today is a counted, finished day and the current run has earned
 * more streak bonuses than have been paid within it. Paid bonuses are the
 * `streak` entries dated inside the run, so a weekend finish (not counted)
 * or a second tick on the same day never pays twice.
 */
export function streakBonusDue(entries: Entry[], today: string, rules: RewardRules): boolean {
  if (rules.streakLength <= 0 || rules.streakBonus <= 0) return false;
  if (rules.schoolDaysOnly && isWeekend(today)) return false;
  if (!entries.some((e) => e.kind === "all_done" && e.date === today)) return false;
  const run = streakRun(entries, today, rules);
  if (run.length === 0 || run.start === null) return false;
  const earned = Math.floor(run.length / rules.streakLength);
  const paid = entries.filter((e) => e.kind === "streak" && e.date >= run.start! && e.date <= today).length;
  return earned > paid;
}

export type GoalProgress = {
  balance: number;
  cost: number;
  /** 0..1 */
  fraction: number;
  reached: boolean;
  remaining: number;
};

export function goalProgress(entries: Entry[], cost: number): GoalProgress {
  const b = balance(entries);
  const c = Math.max(0, cost);
  const reached = c > 0 && b >= c;
  return {
    balance: b,
    cost: c,
    fraction: c > 0 ? Math.max(0, Math.min(1, b / c)) : 0,
    reached,
    remaining: Math.max(0, c - b),
  };
}

/**
 * Tokens the kid may still earn today from jobs: a cap so nothing can be
 * farmed by re-adding jobs. `taskCount` is the active jobs today.
 */
export function dailyTaskCap(taskCount: number, rules: Pick<RewardRules, "tokenPerTask">): number {
  return Math.max(0, taskCount) * Math.max(0, rules.tokenPerTask);
}

export function earnedTodayFromTasks(entries: Entry[], today: string): number {
  return entries
    .filter((e) => e.kind === "task" && e.date === today)
    .reduce((s, e) => s + e.amount, 0);
}

/**
 * What a claim should write: a negative entry for the goal cost. Returns
 * null when the balance does not cover it.
 */
export function claimAmount(entries: Entry[], cost: number): number | null {
  if (cost <= 0) return null;
  return balance(entries) >= cost ? -cost : null;
}
