// Reward flow against the embedded Postgres (npm run test:db). Skipped when
// DATABASE_URL is absent so `npm test` stays database-free.
import { beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("completeTask flow", () => {
  let familyId = "", kidId = "", morning = "", bedtime = "", taskIds: string[] = [], bedIds: string[] = [];
  // 2026-10-05 is a Monday; London = UTC+1 in October.
  const at = (hhmm: string, day = "05") => new Date(`2026-10-${day}T${hhmm}:00Z`);

  beforeAll(async () => {
    const { prisma } = await import("@/lib/prisma");
    const family = await prisma.family.create({
      data: {
        name: "Test", inviteCode: `T${Date.now()}`, timezone: "Europe/London",
        kids: { create: { name: "Kid", routines: { create: [
          { name: "Morning", startTime: "07:00", endTime: "08:15", days: [1, 2, 3, 4, 5], bonus: 3, streak: true, sortOrder: 0,
            tasks: { create: [{ label: "A", sortOrder: 0 }, { label: "B", sortOrder: 1 }, { label: "C", sortOrder: 2 }, { label: "Swim", sortOrder: 3, days: [2] }] } },
          { name: "Bedtime", startTime: "18:30", endTime: "19:30", days: [0, 1, 2, 3, 4, 5, 6], bonus: 2, streak: false, sortOrder: 1,
            tasks: { create: [{ label: "Bath", sortOrder: 0 }, { label: "Story", sortOrder: 1 }] } },
        ] } } },
      },
      include: { kids: { include: { routines: { orderBy: { sortOrder: "asc" }, include: { tasks: { orderBy: { sortOrder: "asc" } } } } } } },
    });
    familyId = family.id; kidId = family.kids[0].id;
    const [m, b] = family.kids[0].routines;
    morning = m.id; bedtime = b.id;
    taskIds = m.tasks.map((t) => t.id); bedIds = b.tasks.map((t) => t.id);
  });

  it("schedules jobs by routine days and task days", async () => {
    const { getState } = await import("@/lib/family");
    const mon = (await getState(familyId, at("06:30"))).kids[0];
    expect(mon.routines.map((r) => [r.name, r.scheduled, r.tasks.length])).toEqual([["Morning", true, 3], ["Bedtime", true, 2]]);
    const tue = (await getState(familyId, at("06:30", "06"))).kids[0];
    expect(tue.routines[0].tasks.map((t) => t.label)).toEqual(["A", "B", "C", "Swim"]);
    const sat = (await getState(familyId, at("06:30", "10"))).kids[0];
    expect(sat.routines.map((r) => r.scheduled)).toEqual([false, true]);
  });

  it("refuses a job that is not on today", async () => {
    const { completeTask } = await import("@/lib/family");
    await expect(completeTask(familyId, kidId, taskIds[3], at("06:30"))).rejects.toThrow("not on today");
  });

  it("awards a token per job, the routine bonus on finishing before its end, and nothing twice", async () => {
    const { completeTask, getState } = await import("@/lib/family");
    expect(await completeTask(familyId, kidId, taskIds[0], at("06:30"))).toMatchObject({ awarded: 1, allDone: false, bonus: 0 });
    expect(await completeTask(familyId, kidId, taskIds[0], at("06:31"))).toMatchObject({ awarded: 0 });
    await completeTask(familyId, kidId, taskIds[1], at("06:32"));
    expect(await completeTask(familyId, kidId, taskIds[2], at("06:33"))).toMatchObject({ awarded: 1, allDone: true, bonus: 3, streakBonus: 0, routine: "Morning" });
    const kid = (await getState(familyId, at("06:34"))).kids[0];
    expect(kid.balance).toBe(6);
    expect(kid.routines[0].allDone).toBe(true);
    expect(kid.routines[0].bonusEarned).toBe(true);
    expect(kid.streak).toBe(1);
  });

  it("undo removes the token and the bonus, and re-finishing re-awards once", async () => {
    const { completeTask, getState, undoLast } = await import("@/lib/family");
    await undoLast(familyId, kidId, undefined, at("06:40"));
    let kid = (await getState(familyId, at("06:41"))).kids[0];
    expect(kid.balance).toBe(2);
    expect(kid.routines[0].doneCount).toBe(2);
    expect(await completeTask(familyId, kidId, taskIds[2], at("06:42"))).toMatchObject({ awarded: 1, bonus: 3 });
    kid = (await getState(familyId, at("06:43"))).kids[0];
    expect(kid.balance).toBe(6);
  });

  it("keeps the bonus when un-ticking after the routine end, and gives none for a late finish", async () => {
    const { completeTask, uncompleteTask, getState } = await import("@/lib/family");
    await uncompleteTask(familyId, kidId, taskIds[2], at("07:30"));
    expect((await getState(familyId, at("07:31"))).kids[0].balance).toBe(5);
    expect(await completeTask(familyId, kidId, taskIds[2], at("07:32"))).toMatchObject({ awarded: 1, allDone: true, bonus: 0 });
    expect((await getState(familyId, at("07:33"))).kids[0].balance).toBe(6);
    await uncompleteTask(familyId, kidId, taskIds[2], at("06:50"));
    expect((await getState(familyId, at("06:51"))).kids[0].balance).toBe(2);
    expect(await completeTask(familyId, kidId, taskIds[2], at("07:40"))).toMatchObject({ awarded: 1, allDone: true, bonus: 0 });
    expect((await getState(familyId, at("07:41"))).kids[0].balance).toBe(3);
  });

  it("evening routine earns its own bonus and does not touch the morning streak", async () => {
    const { completeTask, getState } = await import("@/lib/family");
    // 18:00Z = 19:00 London, inside Bedtime.
    await completeTask(familyId, kidId, bedIds[0], at("18:00"));
    expect(await completeTask(familyId, kidId, bedIds[1], at("18:01"))).toMatchObject({ awarded: 1, allDone: true, bonus: 2, routine: "Bedtime" });
    const kid = (await getState(familyId, at("18:02"))).kids[0];
    expect(kid.balance).toBe(7);
    expect(kid.routines[1].bonusEarned).toBe(true);
    // Morning was finished late today, so no streak day; bedtime's all_done must not count.
    expect(kid.streak).toBe(0);
  });

  it("records the morning for the streak even when its bonus is zero", async () => {
    const { completeTask, uncompleteTask, getState } = await import("@/lib/family");
    const { prisma } = await import("@/lib/prisma");
    await prisma.routine.update({ where: { id: morning }, data: { bonus: 0 } });
    await uncompleteTask(familyId, kidId, taskIds[2], at("06:55"));
    expect(await completeTask(familyId, kidId, taskIds[2], at("06:56"))).toMatchObject({ allDone: true, bonus: 0 });
    const kid = (await getState(familyId, at("06:57"))).kids[0];
    expect(kid.streak).toBe(1);
    expect(kid.balance).toBe(7);
    await prisma.routine.update({ where: { id: morning }, data: { bonus: 3 } });
  });

  it("claims the goal and carries the remainder", async () => {
    const { adjustBalance, claimGoal, getState } = await import("@/lib/family");
    const { prisma } = await import("@/lib/prisma");
    await prisma.kid.update({ where: { id: kidId }, data: { goalCost: 8, goalName: "Park" } });
    await adjustBalance(familyId, kidId, 2, "test", at("08:00"));
    expect((await getState(familyId, at("08:01"))).kids[0].goal.reached).toBe(true);
    expect(await claimGoal(familyId, kidId, at("08:02"))).toEqual({ claimed: 8 });
    expect((await getState(familyId, at("08:03"))).kids[0].balance).toBe(1);
    await expect(claimGoal(familyId, kidId, at("08:04"))).rejects.toThrow("goal not reached");
  });

  it("starts a fresh day on the next local date but keeps the jar", async () => {
    const { getState } = await import("@/lib/family");
    const kid = (await getState(familyId, at("06:00", "06"))).kids[0];
    expect(kid.routines[0].doneCount).toBe(0);
    expect(kid.balance).toBe(1);
  });

  it("counts an early finish for the streak but pays no bonus, and undo survives a rename", async () => {
    const { completeTask, getState, saveKids, undoLast } = await import("@/lib/family");
    // Wednesday 07 Oct, 05:00Z = 06:00 London, before Morning starts at 07:00.
    const d = "07";
    await completeTask(familyId, kidId, taskIds[0], at("05:00", d));
    await completeTask(familyId, kidId, taskIds[1], at("05:01", d));
    expect(await completeTask(familyId, kidId, taskIds[2], at("05:02", d))).toMatchObject({ allDone: true, bonus: 0 });
    let kid = (await getState(familyId, at("05:03", d))).kids[0];
    expect(kid.routines[0].bonusEarned).toBe(true); // all_done row exists (amount 0): the day counts
    expect(kid.streak).toBe(1);
    // Rename C (deactivates the old task), then undo the last tick.
    await saveKids(familyId, [{
      id: kidId, name: "Kid", colour: "marigold", theme: "star", goalName: "", goalCost: 20,
      routines: [{ id: morning, name: "Morning", startTime: "07:00", endTime: "08:15", days: [1, 2, 3, 4, 5], bonus: 3, streak: true,
        tasks: [{ label: "A", days: [], date: null }, { label: "B", days: [], date: null }, { label: "C renamed", days: [], date: null }, { label: "Swim", days: [2], date: null }] },
      { id: bedtime, name: "Bedtime", startTime: "18:30", endTime: "19:30", days: [0, 1, 2, 3, 4, 5, 6], bonus: 2, streak: false,
        tasks: [{ label: "Bath", days: [], date: null }, { label: "Story", days: [], date: null }] }],
    }], at("05:04", d));
    await undoLast(familyId, kidId, morning, at("05:05", d));
    kid = (await getState(familyId, at("05:06", d))).kids[0];
    expect(kid.routines[0].doneCount).toBe(2);
    const balanceAfter = kid.balance;
    await undoLast(familyId, kidId, morning, at("05:07", d));
    await undoLast(familyId, kidId, morning, at("05:08", d));
    expect((await getState(familyId, at("05:09", d))).kids[0].balance).toBe(balanceAfter - 2);
  });

  it("brings back a job deleted and re-added by mistake with its tick intact", async () => {
    const { completeTask, getState, saveKids } = await import("@/lib/family");
    const d = "07";
    const base = (tasks: { label: string; days: number[]; date: string | null }[]) => [{
      id: kidId, name: "Kid", colour: "marigold", theme: "star", goalName: "", goalCost: 20,
      routines: [{ id: morning, name: "Morning", startTime: "07:00", endTime: "08:15", days: [1, 2, 3, 4, 5], bonus: 3, streak: true, tasks },
      { id: bedtime, name: "Bedtime", startTime: "18:30", endTime: "19:30", days: [0, 1, 2, 3, 4, 5, 6], bonus: 2, streak: false,
        tasks: [{ label: "Bath", days: [], date: null }, { label: "Story", days: [], date: null }] }],
    }];
    const all = [{ label: "A", days: [], date: null }, { label: "B", days: [], date: null }, { label: "C", days: [], date: null }, { label: "Swim", days: [2], date: null }];
    await saveKids(familyId, base(all), at("06:20", d));
    const a = (await getState(familyId, at("06:21", d))).kids[0].routines[0].tasks.find((t) => t.label === "A")!;
    await completeTask(familyId, kidId, a.id, at("06:22", d));
    await saveKids(familyId, base(all.slice(1)), at("06:23", d));
    await saveKids(familyId, base(all), at("06:24", d));
    const again = (await getState(familyId, at("06:25", d))).kids[0].routines[0].tasks.find((t) => t.label === "A")!;
    expect(again.id).toBe(a.id);
    expect(again.done).toBe(true);
  });

  it("lets a one-off share a label with a recurring job, and rejects a duplicate", async () => {
    const { addOneOff, getState, saveKids } = await import("@/lib/family");
    await addOneOff(familyId, bedtime, "Bath", "2026-10-08", at("06:00", "07"));
    await expect(addOneOff(familyId, bedtime, "Bath", "2026-10-08", at("06:00", "07"))).rejects.toThrow("already on");
    let kid = (await getState(familyId, at("06:00", "08"))).kids[0];
    expect(kid.routines[1].tasks.map((t) => t.label)).toEqual(["Bath", "Story", "Bath"]);
    // Saving the editor as-is keeps both: keyed by label and date.
    await saveKids(familyId, [{
      id: kidId, name: "Kid", colour: "marigold", theme: "star", goalName: "", goalCost: 20,
      routines: [{ id: morning, name: "Morning", startTime: "07:00", endTime: "08:15", days: [1, 2, 3, 4, 5], bonus: 3, streak: true,
        tasks: [{ label: "A", days: [], date: null }, { label: "B", days: [], date: null }, { label: "C", days: [], date: null }, { label: "Swim", days: [2], date: null }] },
      { id: bedtime, name: "Bedtime", startTime: "18:30", endTime: "19:30", days: [0, 1, 2, 3, 4, 5, 6], bonus: 2, streak: false,
        tasks: [{ label: "Bath", days: [], date: null }, { label: "Story", days: [], date: null }, { label: "Bath", days: [], date: "2026-10-08" }] }],
    }], at("06:00", "07"));
    kid = (await getState(familyId, at("06:00", "08"))).kids[0];
    expect(kid.routines[1].tasks.map((t) => t.label)).toEqual(["Bath", "Story", "Bath"]);
    expect((await getState(familyId, at("06:00", "09"))).kids[0].routines[1].tasks.map((t) => t.label)).toEqual(["Bath", "Story"]);
    // A past one-off drops out of the editor list but is not deactivated by a save.
    const later = (await getState(familyId, at("06:00", "09"))).kids[0];
    expect(later.routines[1].allTasks.map((t) => t.label)).toEqual(["Bath", "Story"]);
  });

  it("adds a one-off, copies routines, and saves routine edits by id", async () => {
    const { addOneOff, copyRoutines, getState, saveKids } = await import("@/lib/family");
    const { prisma } = await import("@/lib/prisma");
    await addOneOff(familyId, bedtime, "Dentist form", "2026-10-07", at("06:00", "07"));
    let kid = (await getState(familyId, at("06:00", "07"))).kids[0];
    expect(kid.routines[1].tasks.map((t) => t.label)).toContain("Dentist form");
    expect((await getState(familyId, at("06:00", "08"))).kids[0].routines[1].tasks.map((t) => t.label)).not.toContain("Dentist form");

    const other = await prisma.kid.create({ data: { familyId, name: "Other", sortOrder: 1, routines: { create: [{ name: "Only", sortOrder: 0 }] } } });
    await copyRoutines(familyId, kidId, other.id, at("06:00", "07"));
    const copied = (await getState(familyId, at("06:00", "07"))).kids.find((k) => k.id === other.id)!;
    expect(copied.routines.map((r) => r.name)).toEqual(["Morning", "Bedtime"]);
    expect(copied.routines[0].allTasks.map((t) => t.label)).toEqual(["A", "B", "C", "Swim"]);
    // Copied as of 07 Oct: both the Bath (08 Oct) and Dentist form (07 Oct) one-offs are still ahead.
    expect(copied.routines[1].allTasks.map((t) => t.label)).toEqual(["Bath", "Story", "Bath", "Dentist form"]);
    expect(copied.routines[1].allTasks.filter((t) => t.date).map((t) => t.date)).toEqual(["2026-10-08", "2026-10-07"]);

    kid = (await getState(familyId, at("06:00", "07"))).kids[0];
    const balanceBefore = kid.balance;
    await saveKids(familyId, [{
      id: kidId, name: "Kid", colour: "marigold", theme: "star", goalName: "", goalCost: 20,
      routines: [{ id: morning, name: "Morning", startTime: "07:00", endTime: "08:30", days: [1, 2, 3, 4, 5], bonus: 3, streak: true,
        tasks: [{ label: "A", days: [], date: null }, { label: "New job", days: [3], date: null }] }],
    }], at("06:00", "07"));
    kid = (await getState(familyId, at("06:00", "07"))).kids[0];
    expect(kid.routines.map((r) => r.name)).toEqual(["Morning"]);
    expect(kid.routines[0].endTime).toBe("08:30");
    expect(kid.routines[0].allTasks.map((t) => t.label)).toEqual(["A", "New job"]);
    // Bedtime is archived, not deleted: its earned tokens survive.
    expect(kid.balance).toBe(balanceBefore);
  });
});
