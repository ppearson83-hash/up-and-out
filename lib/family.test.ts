// Reward flow against the embedded Postgres (npm run test:db). Skipped when
// DATABASE_URL is absent so `npm test` stays database-free.
import { beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("completeTask flow", () => {
  let familyId = "", kidId = "", taskIds: string[] = [];
  const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00Z`); // Monday; London = UTC+1 in October

  beforeAll(async () => {
    const { prisma } = await import("@/lib/prisma");
    const family = await prisma.family.create({
      data: {
        name: "Test", inviteCode: `T${Date.now()}`, timezone: "Europe/London", leaveTime: "08:15",
        kids: { create: { name: "Kid", tasks: { create: [{ label: "A", sortOrder: 0 }, { label: "B", sortOrder: 1 }, { label: "C", sortOrder: 2 }] } } },
      },
      include: { kids: { include: { tasks: true } } },
    });
    familyId = family.id; kidId = family.kids[0].id; taskIds = family.kids[0].tasks.map((t) => t.id);
  });

  it("awards a token per job, the bonus on finishing before leave time, and nothing twice", async () => {
    const { completeTask, getState } = await import("@/lib/family");
    // 06:30Z = 07:30 London, before 08:15.
    expect(await completeTask(familyId, kidId, taskIds[0], at("06:30"))).toMatchObject({ awarded: 1, allDone: false, bonus: 0 });
    expect(await completeTask(familyId, kidId, taskIds[0], at("06:31"))).toMatchObject({ awarded: 0 });
    await completeTask(familyId, kidId, taskIds[1], at("06:32"));
    expect(await completeTask(familyId, kidId, taskIds[2], at("06:33"))).toMatchObject({ awarded: 1, allDone: true, bonus: 3, streakBonus: 0 });
    const kid = (await getState(familyId, at("06:34"))).kids[0];
    expect(kid.balance).toBe(6);
    expect(kid.allDone).toBe(true);
    expect(kid.streak).toBe(1);
  });

  it("undo removes the token and the bonus, and re-finishing re-awards once", async () => {
    const { completeTask, getState, undoLast } = await import("@/lib/family");
    await undoLast(familyId, kidId, at("06:40"));
    let kid = (await getState(familyId, at("06:41"))).kids[0];
    expect(kid.balance).toBe(2);
    expect(kid.doneCount).toBe(2);
    expect(await completeTask(familyId, kidId, taskIds[2], at("06:42"))).toMatchObject({ awarded: 1, bonus: 3 });
    kid = (await getState(familyId, at("06:43"))).kids[0];
    expect(kid.balance).toBe(6);
  });

  it("keeps the bonus when un-ticking after leave time, and gives none for a late finish", async () => {
    const { completeTask, uncompleteTask, getState } = await import("@/lib/family");
    // 07:30Z = 08:30 London, after 08:15: un-tick keeps the +3, re-tick re-earns only the token.
    await uncompleteTask(familyId, kidId, taskIds[2], at("07:30"));
    expect((await getState(familyId, at("07:31"))).kids[0].balance).toBe(5);
    expect(await completeTask(familyId, kidId, taskIds[2], at("07:32"))).toMatchObject({ awarded: 1, allDone: true, bonus: 0 });
    expect((await getState(familyId, at("07:33"))).kids[0].balance).toBe(6);
    // A genuinely late finish: un-tick before leave, finish after.
    await uncompleteTask(familyId, kidId, taskIds[2], at("06:50"));
    expect((await getState(familyId, at("06:51"))).kids[0].balance).toBe(2);
    expect(await completeTask(familyId, kidId, taskIds[2], at("07:40"))).toMatchObject({ awarded: 1, allDone: true, bonus: 0 });
    expect((await getState(familyId, at("07:41"))).kids[0].balance).toBe(3);
  });

  it("records the day for the streak even when the bonus is zero", async () => {
    const { completeTask, uncompleteTask, getState } = await import("@/lib/family");
    const { prisma } = await import("@/lib/prisma");
    await prisma.family.update({ where: { id: familyId }, data: { allDoneBonus: 0 } });
    await uncompleteTask(familyId, kidId, taskIds[2], at("06:55"));
    expect(await completeTask(familyId, kidId, taskIds[2], at("06:56"))).toMatchObject({ allDone: true, bonus: 0 });
    const kid = (await getState(familyId, at("06:57"))).kids[0];
    expect(kid.streak).toBe(1);
    expect(kid.balance).toBe(3);
    await prisma.family.update({ where: { id: familyId }, data: { allDoneBonus: 3 } });
  });

  it("claims the goal and carries the remainder", async () => {
    const { adjustBalance, claimGoal, getState } = await import("@/lib/family");
    const { prisma } = await import("@/lib/prisma");
    await prisma.kid.update({ where: { id: kidId }, data: { goalCost: 4, goalName: "Park" } });
    await adjustBalance(familyId, kidId, 2, "test", at("08:00"));
    expect((await getState(familyId, at("08:01"))).kids[0].goal.reached).toBe(true);
    expect(await claimGoal(familyId, kidId, at("08:02"))).toEqual({ claimed: 4 });
    expect((await getState(familyId, at("08:03"))).kids[0].balance).toBe(1);
    await expect(claimGoal(familyId, kidId, at("08:04"))).rejects.toThrow("goal not reached");
  });

  it("starts a fresh day on the next local date but keeps the jar", async () => {
    const { getState } = await import("@/lib/family");
    const kid = (await getState(familyId, new Date("2026-10-06T06:00:00Z"))).kids[0];
    expect(kid.doneCount).toBe(0);
    expect(kid.balance).toBe(1);
  });
});
