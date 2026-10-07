// Family state and the mutations the board and settings screens perform.
// Everything here is scoped by familyId; the API layer never touches Prisma.
import type { LedgerKind as DbLedgerKind, Prisma } from "@/app/generated/prisma/client";
import { BadRequestError, NotFoundError } from "@/lib/errors";
import { hhmmToMinutes, localDate, localMinutes } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  balance, claimAmount, dailyTaskCap, earnedTodayFromTasks, goalProgress, streak, streakBonusDue,
  type Entry, type RewardRules,
} from "@/lib/rewards/engine";

export type FamilyRules = RewardRules & {
  timezone: string;
  startTime: string;
  leaveTime: string;
};

export type KidState = {
  id: string;
  name: string;
  colour: string;
  theme: string;
  goalName: string;
  goalCost: number;
  tasks: { id: string; label: string; done: boolean; completedAt: string | null }[];
  doneCount: number;
  allDone: boolean;
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
    startTime: string;
    leaveTime: string;
    schoolDaysOnly: boolean;
    tokenPerTask: number;
    allDoneBonus: number;
    streakLength: number;
    streakBonus: number;
  };
  today: string;
  serverMinutes: number;
  kids: KidState[];
};

function rulesOf(f: {
  tokenPerTask: number; allDoneBonus: number; streakLength: number; streakBonus: number;
  schoolDaysOnly: boolean; timezone: string; startTime: string; leaveTime: string;
}): FamilyRules {
  return {
    tokenPerTask: f.tokenPerTask, allDoneBonus: f.allDoneBonus, streakLength: f.streakLength,
    streakBonus: f.streakBonus, schoolDaysOnly: f.schoolDaysOnly,
    timezone: f.timezone, startTime: f.startTime, leaveTime: f.leaveTime,
  };
}

export async function loadFamily(familyId: string) {
  const family = await prisma.family.findUnique({ where: { id: familyId } });
  if (!family) throw new NotFoundError("family");
  return family;
}

export async function getState(familyId: string, now = new Date()): Promise<FamilyState> {
  const family = await loadFamily(familyId);
  const today = localDate(family.timezone, now);
  const kids = await prisma.kid.findMany({
    where: { familyId, archived: false },
    orderBy: { sortOrder: "asc" },
    include: {
      tasks: { where: { active: true }, orderBy: { sortOrder: "asc" } },
      completions: { where: { date: today } },
      ledger: { select: { date: true, kind: true, amount: true } },
    },
  });
  const rules = rulesOf(family);
  return {
    family: {
      id: family.id, name: family.name, inviteCode: family.inviteCode, hasPin: Boolean(family.pinHash),
      timezone: family.timezone, startTime: family.startTime, leaveTime: family.leaveTime,
      schoolDaysOnly: family.schoolDaysOnly, tokenPerTask: family.tokenPerTask,
      allDoneBonus: family.allDoneBonus, streakLength: family.streakLength, streakBonus: family.streakBonus,
    },
    today,
    serverMinutes: localMinutes(family.timezone, now),
    kids: kids.map((k) => {
      const doneBy = new Map(k.completions.map((c) => [c.taskId, c.completedAt]));
      const entries: Entry[] = k.ledger;
      const tasks = k.tasks.map((t) => ({
        id: t.id, label: t.label, done: doneBy.has(t.id),
        completedAt: doneBy.get(t.id)?.toISOString() ?? null,
      }));
      const doneCount = tasks.filter((t) => t.done).length;
      const g = goalProgress(entries, k.goalCost);
      return {
        id: k.id, name: k.name, colour: k.colour, theme: k.theme, goalName: k.goalName, goalCost: k.goalCost,
        tasks, doneCount, allDone: tasks.length > 0 && doneCount === tasks.length,
        balance: balance(entries), streak: streak(entries, today, rules),
        goal: { fraction: g.fraction, reached: g.reached, remaining: g.remaining },
        earnedToday: earnedTodayFromTasks(entries, today),
      };
    }),
  };
}

function beforeLeave(family: { timezone: string; leaveTime: string }, now: Date): boolean {
  return localMinutes(family.timezone, now) < hhmmToMinutes(family.leaveTime);
}

// Serialises writes for one kid: two devices ticking the last two jobs at
// once must not both miss the all-done bonus, and two parents claiming at
// once must not both pass the balance check.
async function lockKid(tx: Prisma.TransactionClient, kidId: string): Promise<void> {
  await tx.$executeRaw`SELECT id FROM "Kid" WHERE id = ${kidId} FOR UPDATE`;
}

async function kidInFamily(kidId: string, familyId: string) {
  const kid = await prisma.kid.findFirst({ where: { id: kidId, familyId, archived: false } });
  if (!kid) throw new NotFoundError("kid");
  return kid;
}

export type CompleteResult = { awarded: number; allDone: boolean; bonus: number; streakBonus: number };

/**
 * Tap a job. Idempotent per (kid, task, day). Awards the task token (under
 * the daily cap), then the all-done bonus if this finished the list before
 * leave time, then the streak bonus if the streak just hit its length.
 */
export async function completeTask(familyId: string, kidId: string, taskId: string, now = new Date()): Promise<CompleteResult> {
  const family = await loadFamily(familyId);
  const kid = await kidInFamily(kidId, familyId);
  const task = await prisma.task.findFirst({ where: { id: taskId, kidId: kid.id, active: true } });
  if (!task) throw new NotFoundError("task");
  const rules = rulesOf(family);
  const today = localDate(family.timezone, now);

  return prisma.$transaction(async (tx) => {
    await lockKid(tx, kid.id);
    const existing = await tx.completion.findUnique({ where: { kidId_taskId_date: { kidId: kid.id, taskId: task.id, date: today } } });
    if (existing) return { awarded: 0, allDone: false, bonus: 0, streakBonus: 0 };

    const activeCount = await tx.task.count({ where: { kidId: kid.id, active: true } });
    const ledgerBefore = await tx.ledgerEntry.findMany({ where: { kidId: kid.id }, select: { date: true, kind: true, amount: true } });
    const cap = dailyTaskCap(activeCount, rules);
    const earned = earnedTodayFromTasks(ledgerBefore, today);
    const awarded = Math.max(0, Math.min(rules.tokenPerTask, cap - earned));

    const completion = await tx.completion.create({ data: { kidId: kid.id, taskId: task.id, date: today, completedAt: now } });
    if (awarded > 0) {
      await tx.ledgerEntry.create({ data: { kidId: kid.id, date: today, kind: "task", amount: awarded, note: task.label, completionId: completion.id } });
    }

    const doneCount = await tx.completion.count({ where: { kidId: kid.id, date: today, task: { active: true } } });
    const allDone = activeCount > 0 && doneCount === activeCount;
    let bonus = 0, streakBonus = 0;
    if (allDone) {
      const alreadyDone = await tx.ledgerEntry.findFirst({ where: { kidId: kid.id, date: today, kind: "all_done" } });
      // The all_done row is the streak record, so it is written even when the
      // bonus is configured to 0; only the amount depends on the setting.
      if (!alreadyDone && beforeLeave(family, now)) {
        bonus = Math.max(0, rules.allDoneBonus);
        await tx.ledgerEntry.create({ data: { kidId: kid.id, date: today, kind: "all_done", amount: bonus, note: "Everything done before leaving time" } });
        const ledgerNow = await tx.ledgerEntry.findMany({ where: { kidId: kid.id }, select: { date: true, kind: true, amount: true } });
        if (streakBonusDue(ledgerNow, today, rules)) {
          streakBonus = rules.streakBonus;
          const n = streak(ledgerNow, today, rules);
          await tx.ledgerEntry.create({ data: { kidId: kid.id, date: today, kind: "streak", amount: streakBonus, note: `${n} days in a row` } });
        }
      }
    }
    return { awarded, allDone, bonus, streakBonus };
  });
}

/**
 * Un-tap a job. Removes its token. Before leave time the same-day bonuses go
 * too, since finishing before leaving no longer holds and re-ticking will
 * re-award them; after leave time they stay, because a re-tick could not
 * earn them back and the morning was in fact finished on time.
 */
export async function uncompleteTask(familyId: string, kidId: string, taskId: string, now = new Date()): Promise<void> {
  const family = await loadFamily(familyId);
  const kid = await kidInFamily(kidId, familyId);
  const today = localDate(family.timezone, now);
  await prisma.$transaction(async (tx) => {
    await lockKid(tx, kid.id);
    const existing = await tx.completion.findUnique({ where: { kidId_taskId_date: { kidId: kid.id, taskId, date: today } } });
    if (!existing) return;
    // The task ledger entry cascades with the completion.
    await tx.completion.delete({ where: { id: existing.id } });
    if (beforeLeave(family, now)) {
      await tx.ledgerEntry.deleteMany({ where: { kidId: kid.id, date: today, kind: { in: ["all_done", "streak"] } } });
    }
  });
}

/** Undo the most recent completion today for a kid. */
export async function undoLast(familyId: string, kidId: string, now = new Date()): Promise<void> {
  const family = await loadFamily(familyId);
  const kid = await kidInFamily(kidId, familyId);
  const today = localDate(family.timezone, now);
  const last = await prisma.completion.findFirst({ where: { kidId: kid.id, date: today }, orderBy: { completedAt: "desc" } });
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

export type HistoryRow = { id: string; date: string; kind: DbLedgerKind; amount: number; note: string; createdAt: string };

export async function history(familyId: string, kidId: string, limit = 100): Promise<HistoryRow[]> {
  const kid = await kidInFamily(kidId, familyId);
  const rows = await prisma.ledgerEntry.findMany({ where: { kidId: kid.id }, orderBy: [{ createdAt: "desc" }], take: limit });
  return rows.map((r) => ({ id: r.id, date: r.date, kind: r.kind, amount: r.amount, note: r.note, createdAt: r.createdAt.toISOString() }));
}

export type FamilyPatch = Partial<{
  name: string; timezone: string; startTime: string; leaveTime: string; schoolDaysOnly: boolean;
  tokenPerTask: number; allDoneBonus: number; streakLength: number; streakBonus: number;
}>;

export async function updateFamily(familyId: string, patch: FamilyPatch): Promise<void> {
  await prisma.family.update({ where: { id: familyId }, data: patch });
}

export type KidInput = {
  id?: string;
  name: string;
  colour: string;
  theme: string;
  goalName: string;
  goalCost: number;
  tasks: string[];
};

/**
 * Replace the family's kids and jobs with the submitted list. Existing kids
 * (by id) keep their ledger; kids left out are archived, not deleted. Jobs
 * are matched by label so a renamed job keeps today's completion only if
 * the label is unchanged, which is the honest outcome.
 */
export async function saveKids(familyId: string, kids: KidInput[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.kid.findMany({ where: { familyId }, include: { tasks: true } });
    const keep = new Set<string>();
    for (const [i, input] of kids.entries()) {
      const current = input.id ? existing.find((k) => k.id === input.id) : undefined;
      const data = { name: input.name, colour: input.colour, theme: input.theme, goalName: input.goalName, goalCost: input.goalCost, sortOrder: i, archived: false };
      const kid = current
        ? await tx.kid.update({ where: { id: current.id }, data })
        : await tx.kid.create({ data: { ...data, familyId } });
      keep.add(kid.id);

      const byLabel = new Map((current?.tasks ?? []).map((t) => [t.label, t]));
      const wanted = new Set(input.tasks);
      for (const [j, label] of input.tasks.entries()) {
        const t = byLabel.get(label);
        if (t) await tx.task.update({ where: { id: t.id }, data: { sortOrder: j, active: true } });
        else await tx.task.create({ data: { kidId: kid.id, label, sortOrder: j } });
      }
      for (const t of current?.tasks ?? []) {
        if (!wanted.has(t.label) && t.active) await tx.task.update({ where: { id: t.id }, data: { active: false } });
      }
    }
    for (const k of existing) {
      if (!keep.has(k.id) && !k.archived) await tx.kid.update({ where: { id: k.id }, data: { archived: true } });
    }
  });
}
