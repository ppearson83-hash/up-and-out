// Family state and the mutations the board and settings screens perform.
// Everything here is scoped by familyId; the API layer never touches Prisma.
import type { LedgerKind as DbLedgerKind, Prisma } from "@/app/generated/prisma/client";
import { hhmmToMinutes, localDate, localMinutes } from "@/lib/dates";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  balance, claimAmount, dailyTaskCap, earnedTodayFromTasks, goalProgress, streak, streakBonusDue, streakEntries,
  type Entry, type RewardRules,
} from "@/lib/rewards/engine";
import { isRoutineScheduled, isTaskScheduled, routineStatus, type RoutineStatus } from "@/lib/schedule";

export type TaskState = { id: string; label: string; days: number[]; date: string | null; done: boolean; completedAt: string | null };

export type RoutineState = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  days: number[];
  bonus: number;
  streak: boolean;
  /** Runs today (a routine day, or a one-off job dated today). */
  scheduled: boolean;
  status: RoutineStatus;
  /** Today's jobs only; the full list lives in `allTasks`. */
  tasks: TaskState[];
  allTasks: { id: string; label: string; days: number[]; date: string | null }[];
  doneCount: number;
  allDone: boolean;
  /** The on-time bonus has been earned today. */
  bonusEarned: boolean;
};

export type KidState = {
  id: string;
  name: string;
  colour: string;
  theme: string;
  goalName: string;
  goalCost: number;
  routines: RoutineState[];
  balance: number;
  streak: number;
  goal: { fraction: number; reached: boolean; remaining: number };
  earnedToday: number;
};

export type FamilyState = {
  family: {
    id: string;
    name: string;
    inviteCode: string;
    hasPin: boolean;
    timezone: string;
    schoolDaysOnly: boolean;
    tokenPerTask: number;
    streakLength: number;
    streakBonus: number;
  };
  today: string;
  serverMinutes: number;
  kids: KidState[];
};

type FamilyRow = { tokenPerTask: number; streakLength: number; streakBonus: number; schoolDaysOnly: boolean; timezone: string };

function rulesOf(f: FamilyRow): RewardRules {
  return { tokenPerTask: f.tokenPerTask, allDoneBonus: 0, streakLength: f.streakLength, streakBonus: f.streakBonus, schoolDaysOnly: f.schoolDaysOnly };
}

export async function loadFamily(familyId: string) {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new NotFoundError("family");
  return family;
}

const kidInclude = {
  routines: { where: { archived: false }, orderBy: { sortOrder: "asc" as const }, include: { tasks: { where: { active: true }, orderBy: { sortOrder: "asc" as const } } } },
  ledger: { select: { date: true, kind: true, amount: true, routineId: true } },
};

export async function getState(familyId: string, now = new Date()): Promise<FamilyState> {
  const family = await loadFamily(familyId);
  const today = localDate(family.timezone, now);
  const nowM = localMinutes(family.timezone, now);
  const kids = await prisma.kid.findMany({
    where: { familyId, archived: false },
    orderBy: { sortOrder: "asc" },
    include: { ...kidInclude, completions: { where: { date: today } } },
  });
  const rules = rulesOf(family);
  return {
    family: {
      id: family.id, name: family.name, inviteCode: family.inviteCode, hasPin: Boolean(family.pinHash),
      timezone: family.timezone, schoolDaysOnly: family.schoolDaysOnly, tokenPerTask: family.tokenPerTask,
      streakLength: family.streakLength, streakBonus: family.streakBonus,
    },
    today,
    serverMinutes: nowM,
    kids: kids.map((k) => {
      const doneBy = new Map(k.completions.map((c) => [c.taskId, c.completedAt]));
      const entries: Entry[] = k.ledger;
      const streakRoutine = k.routines.find((r) => r.streak)?.id ?? null;
      const routines: RoutineState[] = k.routines.map((r) => {
        const todays = r.tasks.filter((t) => isTaskScheduled(t, r, today)).map((t) => ({
          id: t.id, label: t.label, days: t.days, date: t.date, done: doneBy.has(t.id),
          completedAt: doneBy.get(t.id)?.toISOString() ?? null,
        }));
        const doneCount = todays.filter((t) => t.done).length;
        return {
          id: r.id, name: r.name, startTime: r.startTime, endTime: r.endTime, days: r.days, bonus: r.bonus, streak: r.streak,
          scheduled: isRoutineScheduled(r, today), status: routineStatus(r, nowM),
          tasks: todays,
          // Past one-offs are over; leave them out of the editor and calendar.
          allTasks: r.tasks.filter((t) => !t.date || t.date >= today).map((t) => ({ id: t.id, label: t.label, days: t.days, date: t.date })),
          doneCount, allDone: todays.length > 0 && doneCount === todays.length,
          bonusEarned: entries.some((e) => e.kind === "all_done" && e.date === today && e.routineId === r.id),
        };
      });
      const g = goalProgress(entries, k.goalCost);
      return {
        id: k.id, name: k.name, colour: k.colour, theme: k.theme, goalName: k.goalName, goalCost: k.goalCost,
        routines,
        balance: balance(entries), streak: streak(streakEntries(entries, streakRoutine), today, rules),
        goal: { fraction: g.fraction, reached: g.reached, remaining: g.remaining },
        earnedToday: earnedTodayFromTasks(entries, today),
      };
    }),
  };
}

// Serialises writes for one kid: two devices ticking the last two jobs at
// once must not both miss the on-time bonus, and two parents claiming at
// once must not both pass the balance check.
async function lockKid(tx: Prisma.TransactionClient, kidId: string): Promise<void> {
  await tx.$executeRaw`SELECT id FROM "Kid" WHERE id = ${kidId} FOR UPDATE`;
}

async function kidInFamily(kidId: string, familyId: string) {
  const kid = await prisma.kid.findFirst({ where: { id: kidId, familyId, archived: false } });
  if (!kid) throw new NotFoundError("kid");
  return kid;
}

/** The task with its routine, checked to belong to the kid. */
async function taskOfKid(taskId: string, kidId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, active: true, routine: { kidId, archived: false } }, include: { routine: { include: { tasks: { where: { active: true } } } } } });
  if (!task) throw new NotFoundError("task");
  return task;
}

/** Number of jobs scheduled today across every routine of the kid. */
async function scheduledTodayCount(tx: Prisma.TransactionClient, kidId: string, today: string): Promise<number> {
  const routines = await tx.routine.findMany({ where: { kidId, archived: false }, include: { tasks: { where: { active: true } } } });
  return routines.reduce((n, r) => n + r.tasks.filter((t) => isTaskScheduled(t, r, today)).length, 0);
}

export type CompleteResult = { awarded: number; allDone: boolean; bonus: number; streakBonus: number; routine: string };

/**
 * Tap a job. Idempotent per (kid, task, day). Awards the task token (under
 * the daily cap), then the routine's on-time bonus if this finished the
 * routine's jobs for today inside its time window, then the streak bonus if
 * that routine carries the streak and it just hit its length.
 */
export async function completeTask(familyId: string, kidId: string, taskId: string, now = new Date()): Promise<CompleteResult> {
  const family = await loadFamily(familyId);
  const kid = await kidInFamily(kidId, familyId);
  const task = await taskOfKid(taskId, kid.id);
  const routine = task.routine;
  const rules = rulesOf(family);
  const today = localDate(family.timezone, now);
  const nowM = localMinutes(family.timezone, now);
  if (!isTaskScheduled(task, routine, today)) throw new BadRequestError("that job is not on today");

  return prisma.$transaction(async (tx) => {
    await lockKid(tx, kid.id);
    const existing = await tx.completion.findUnique({ where: { kidId_taskId_date: { kidId: kid.id, taskId: task.id, date: today } } });
    if (existing) return { awarded: 0, allDone: false, bonus: 0, streakBonus: 0, routine: routine.name };

    const ledgerBefore = await tx.ledgerEntry.findMany({ where: { kidId: kid.id }, select: { date: true, kind: true, amount: true, routineId: true } });
    const cap = dailyTaskCap(await scheduledTodayCount(tx, kid.id, today), rules);
    const earned = earnedTodayFromTasks(ledgerBefore, today);
    const awarded = Math.max(0, Math.min(rules.tokenPerTask, cap - earned));

    const completion = await tx.completion.create({ data: { kidId: kid.id, taskId: task.id, date: today, completedAt: now } });
    if (awarded > 0) {
      await tx.ledgerEntry.create({ data: { kidId: kid.id, date: today, kind: "task", amount: awarded, note: task.label, completionId: completion.id, routineId: routine.id } });
    }

    const todaysTaskIds = routine.tasks.filter((t) => isTaskScheduled(t, routine, today)).map((t) => t.id);
    const doneCount = await tx.completion.count({ where: { kidId: kid.id, date: today, taskId: { in: todaysTaskIds } } });
    const allDone = todaysTaskIds.length > 0 && doneCount === todaysTaskIds.length;
    let bonus = 0, streakBonus = 0;
    if (allDone) {
      const alreadyDone = await tx.ledgerEntry.findFirst({ where: { kidId: kid.id, date: today, kind: "all_done", routineId: routine.id } });
      // The all_done row is the streak record, so it is written even when the
      // routine's bonus is 0; only the amount depends on the setting.
      const inWindow = nowM >= hhmmToMinutes(routine.startTime) && nowM < hhmmToMinutes(routine.endTime);
      if (!alreadyDone && inWindow) {
        bonus = Math.max(0, routine.bonus);
        await tx.ledgerEntry.create({ data: { kidId: kid.id, date: today, kind: "all_done", amount: bonus, note: `${routine.name} done on time`, routineId: routine.id } });
        if (routine.streak) {
          const ledgerNow = await tx.ledgerEntry.findMany({ where: { kidId: kid.id }, select: { date: true, kind: true, amount: true, routineId: true } });
          const forStreak = streakEntries(ledgerNow, routine.id);
          if (streakBonusDue(forStreak, today, rules)) {
            streakBonus = rules.streakBonus;
            const n = streak(forStreak, today, rules);
            await tx.ledgerEntry.create({ data: { kidId: kid.id, date: today, kind: "streak", amount: streakBonus, note: `${n} days in a row`, routineId: routine.id } });
          }
        }
      }
    }
    return { awarded, allDone, bonus, streakBonus, routine: routine.name };
  });
}

/**
 * Un-tap a job. Removes its token. Before the routine's end time the
 * routine's same-day bonuses go too, since finishing on time no longer holds
 * and re-ticking will re-award them; after the end time they stay, because a
 * re-tick could not earn them back and the routine was in fact finished on time.
 */
export async function uncompleteTask(familyId: string, kidId: string, taskId: string, now = new Date()): Promise<void> {
  const family = await loadFamily(familyId);
  const kid = await kidInFamily(kidId, familyId);
  // No active/archived filter: a job renamed or removed after being ticked must still undo.
  const task = await prisma.task.findFirst({ where: { id: taskId, routine: { kidId: kid.id } }, include: { routine: true } });
  if (!task) throw new NotFoundError("task");
  const today = localDate(family.timezone, now);
  const nowM = localMinutes(family.timezone, now);
  await prisma.$transaction(async (tx) => {
    await lockKid(tx, kid.id);
    const existing = await tx.completion.findUnique({ where: { kidId_taskId_date: { kidId: kid.id, taskId, date: today } } });
    if (!existing) return;
    // The task ledger entry cascades with the completion.
    await tx.completion.delete({ where: { id: existing.id } });
    if (nowM < hhmmToMinutes(task.routine.endTime)) {
      await tx.ledgerEntry.deleteMany({ where: { kidId: kid.id, date: today, kind: { in: ["all_done", "streak"] }, routineId: task.routineId } });
    }
  });
}

/** Undo the most recent completion today for a kid (optionally within one routine). */
export async function undoLast(familyId: string, kidId: string, routineId?: string, now = new Date()): Promise<void> {
  const family = await loadFamily(familyId);
  const kid = await kidInFamily(kidId, familyId);
  const today = localDate(family.timezone, now);
  const last = await prisma.completion.findFirst({
    where: { kidId: kid.id, date: today, ...(routineId ? { task: { routineId } } : {}) },
    orderBy: { completedAt: "desc" },
  });
  if (!last) return;
  await uncompleteTask(familyId, kidId, last.taskId, now);
}

export async function claimGoal(familyId: string, kidId: string, now = new Date()): Promise<{ claimed: number }> {
  const family = await loadFamily(familyId);
  const kid = await kidInFamily(kidId, familyId);
  const today = localDate(family.timezone, now);
  return prisma.$transaction(async (tx) => {
    await lockKid(tx, kid.id);
    const entries = await tx.ledgerEntry.findMany({ where: { kidId: kid.id }, select: { date: true, kind: true, amount: true } });
    const amount = claimAmount(entries, kid.goalCost);
    if (amount === null) throw new BadRequestError("goal not reached");
    await tx.ledgerEntry.create({ data: { kidId: kid.id, date: today, kind: "claim", amount, note: kid.goalName || "Goal claimed" } });
    return { claimed: -amount };
  });
}

export async function adjustBalance(familyId: string, kidId: string, amount: number, note: string, now = new Date()): Promise<void> {
  const family = await loadFamily(familyId);
  const kid = await kidInFamily(kidId, familyId);
  if (amount === 0) throw new BadRequestError("amount must not be zero");
  await prisma.ledgerEntry.create({ data: { kidId: kid.id, date: localDate(family.timezone, now), kind: "adjust", amount, note } });
}

export type HistoryRow = { id: string; date: string; kind: DbLedgerKind; amount: number; note: string; routine: string | null; createdAt: string };

export async function history(familyId: string, kidId: string, limit = 100): Promise<HistoryRow[]> {
  const kid = await kidInFamily(kidId, familyId);
  const rows = await prisma.ledgerEntry.findMany({ where: { kidId: kid.id }, orderBy: [{ createdAt: "desc" }], take: limit, include: { routine: { select: { name: true } } } });
  return rows.map((r) => ({ id: r.id, date: r.date, kind: r.kind, amount: r.amount, note: r.note, routine: r.routine?.name ?? null, createdAt: r.createdAt.toISOString() }));
}

export type FamilyPatch = Partial<{ name: string; timezone: string; schoolDaysOnly: boolean; tokenPerTask: number; streakLength: number; streakBonus: number }>;

export async function updateFamily(familyId: string, patch: FamilyPatch): Promise<void> {
  await prisma.family.update({ where: { id: familyId }, data: patch });
}

export type TaskInput = { label: string; days: number[]; date: string | null };
export type RoutineInput = { id?: string; name: string; startTime: string; endTime: string; days: number[]; bonus: number; streak: boolean; tasks: TaskInput[] };
export type KidInput = { id?: string; name: string; colour: string; theme: string; goalName: string; goalCost: number; routines: RoutineInput[] };

/**
 * Replace the family's kids, routines and jobs with the submitted lists.
 * Existing kids (by id) keep their ledger; kids left out are archived, not
 * deleted. Routines are matched by id and jobs by label within a routine, so
 * a renamed job keeps today's tick only if the label is unchanged, which is
 * the honest outcome. A one-off is keyed by label and date, so it can share a
 * label with a recurring job. Routines left out are archived so their history survives.
 */
export const MAX_TASKS = 20;

/** Recurring jobs are keyed by label; one-offs by label and date. */
export function taskKey(t: { label: string; date: string | null }): string {
  return t.date ? `${t.label}@${t.date}` : t.label;
}

export async function saveKids(familyId: string, kids: KidInput[], now = new Date()): Promise<void> {
  const family = await loadFamily(familyId);
  const today = localDate(family.timezone, now);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.kid.findMany({ where: { familyId }, include: { routines: { where: { archived: false }, include: { tasks: true } } } });
    const keep = new Set<string>();
    for (const [i, input] of kids.entries()) {
      const current = input.id ? existing.find((k) => k.id === input.id) : undefined;
      const data = { name: input.name, colour: input.colour, theme: input.theme, goalName: input.goalName, goalCost: input.goalCost, sortOrder: i, archived: false };
      const kid = current ? await tx.kid.update({ where: { id: current.id }, data }) : await tx.kid.create({ data: { ...data, familyId } });
      keep.add(kid.id);

      const keepRoutines = new Set<string>();
      // Exactly one streak routine per kid: the first flagged, else the first routine.
      const streakIndex = Math.max(0, input.routines.findIndex((r) => r.streak));
      for (const [j, rin] of input.routines.entries()) {
        const cur = rin.id ? current?.routines.find((r) => r.id === rin.id) : undefined;
        const rdata = { name: rin.name, startTime: rin.startTime, endTime: rin.endTime, days: rin.days, bonus: rin.bonus, streak: j === streakIndex, sortOrder: j, archived: false };
        const routine = cur ? await tx.routine.update({ where: { id: cur.id }, data: rdata }) : await tx.routine.create({ data: { ...rdata, kidId: kid.id } });
        keepRoutines.add(routine.id);

        const byKey = new Map((cur?.tasks ?? []).filter((t) => t.active).map((t) => [taskKey(t), t]));
        const wanted = new Set(rin.tasks.map(taskKey));
        for (const [n, tin] of rin.tasks.entries()) {
          const t = byKey.get(taskKey(tin));
          const tdata = { sortOrder: n, active: true, days: tin.days, date: tin.date };
          if (t) await tx.task.update({ where: { id: t.id }, data: tdata });
          else await tx.task.create({ data: { ...tdata, routineId: routine.id, label: tin.label } });
        }
        // Past one-offs are not in the editor; leave them alone.
        for (const t of cur?.tasks ?? []) {
          if (t.active && !wanted.has(taskKey(t)) && !(t.date && t.date < today)) {
            await tx.task.update({ where: { id: t.id }, data: { active: false } });
          }
        }
      }
      for (const r of current?.routines ?? []) {
        if (!keepRoutines.has(r.id)) await tx.routine.update({ where: { id: r.id }, data: { archived: true, streak: false } });
      }
    }
    for (const k of existing) {
      if (!keep.has(k.id) && !k.archived) await tx.kid.update({ where: { id: k.id }, data: { archived: true } });
    }
  });
}

/** Add a one-off dated job to a routine (the Calendar tab's quick add). */
export async function addOneOff(familyId: string, routineId: string, label: string, date: string): Promise<void> {
  const routine = await prisma.routine.findFirst({ where: { id: routineId, archived: false, kid: { familyId, archived: false } }, include: { tasks: { where: { active: true } } } });
  if (!routine) throw new NotFoundError("routine");
  const live = routine.tasks.filter((t) => !t.date || t.date >= date);
  if (live.some((t) => taskKey(t) === taskKey({ label, date }))) throw new BadRequestError(`${label} is already on ${date}`);
  if (live.length >= MAX_TASKS) throw new BadRequestError(`${routine.name} already has ${MAX_TASKS} jobs`);
  await prisma.task.create({ data: { routineId: routine.id, label, date, sortOrder: routine.tasks.length } });
}

/** Copy one kid's routines and jobs onto another kid; the target's own routines are archived. */
export async function copyRoutines(familyId: string, fromKidId: string, toKidId: string, now = new Date()): Promise<void> {
  if (fromKidId === toKidId) throw new BadRequestError("same kid");
  const family = await loadFamily(familyId);
  const today = localDate(family.timezone, now);
  const from = await prisma.kid.findFirst({ where: { id: fromKidId, familyId }, include: { routines: { where: { archived: false }, orderBy: { sortOrder: "asc" }, include: { tasks: { where: { active: true }, orderBy: { sortOrder: "asc" } } } } } });
  const to = await kidInFamily(toKidId, familyId);
  if (!from) throw new NotFoundError("kid");
  await prisma.$transaction(async (tx) => {
    await tx.routine.updateMany({ where: { kidId: to.id }, data: { archived: true, streak: false } });
    for (const r of from.routines) {
      await tx.routine.create({ data: {
        kidId: to.id, name: r.name, startTime: r.startTime, endTime: r.endTime, days: r.days, bonus: r.bonus, streak: r.streak, sortOrder: r.sortOrder,
        tasks: { create: r.tasks.filter((t) => !t.date || t.date >= today).map((t) => ({ label: t.label, days: t.days, date: t.date, sortOrder: t.sortOrder })) },
      } });
    }
  });
}

/** Default routines for a new kid. */
export function defaultRoutines(): RoutineInput[] {
  const t = (label: string): TaskInput => ({ label, days: [], date: null });
  return [
    { name: "Morning", startTime: "07:00", endTime: "08:15", days: [1, 2, 3, 4, 5], bonus: 3, streak: true,
      tasks: ["Get up", "Toilet", "Drink water", "Eat breakfast", "Brush teeth", "Brush hair", "Shoes ready", "School bag", "Book bag"].map(t) },
    { name: "After school", startTime: "15:30", endTime: "18:00", days: [1, 2, 3, 4, 5], bonus: 2, streak: false,
      tasks: ["Homework", "Read a book", "Pack tomorrow's bag"].map(t) },
    { name: "Bedtime", startTime: "18:30", endTime: "19:30", days: [0, 1, 2, 3, 4, 5, 6], bonus: 2, streak: false,
      tasks: ["Bath", "Pyjamas", "Brush teeth", "Story"].map(t) },
  ];
}
