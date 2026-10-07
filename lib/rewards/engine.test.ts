import { describe, expect, it } from "vitest";

import {
  balance, claimAmount, dailyTaskCap, earnedTodayFromTasks, goalProgress,
  streak, streakBonusDue, type Entry, type RewardRules,
} from "./engine";

const rules: RewardRules = {
  tokenPerTask: 1, allDoneBonus: 3, streakLength: 5, streakBonus: 5, schoolDaysOnly: true,
};
const e = (date: string, kind: Entry["kind"], amount: number): Entry => ({ date, kind, amount });

describe("balance", () => {
  it("sums every entry including negatives", () => {
    expect(balance([e("2026-10-05", "task", 1), e("2026-10-05", "all_done", 3), e("2026-10-06", "claim", -2)])).toBe(2);
  });
  it("is zero for an empty ledger", () => expect(balance([])).toBe(0));
});

describe("streak", () => {
  // 2026-10-05 is a Monday; 10-03/10-04 are the weekend.
  it("counts consecutive school days and skips weekends", () => {
    const entries = [e("2026-10-01", "all_done", 3), e("2026-10-02", "all_done", 3), e("2026-10-05", "all_done", 3)];
    expect(streak(entries, "2026-10-05", rules)).toBe(3);
  });
  it("does not break when today is not finished yet", () => {
    const entries = [e("2026-10-01", "all_done", 3), e("2026-10-02", "all_done", 3)];
    expect(streak(entries, "2026-10-05", rules)).toBe(2);
  });
  it("breaks on a missed school day", () => {
    const entries = [e("2026-10-01", "all_done", 3), e("2026-10-05", "all_done", 3)];
    expect(streak(entries, "2026-10-05", rules)).toBe(1);
  });
  it("counts weekends when schoolDaysOnly is off", () => {
    const entries = [e("2026-10-02", "all_done", 3), e("2026-10-05", "all_done", 3)];
    expect(streak(entries, "2026-10-05", { schoolDaysOnly: false })).toBe(1);
    expect(streak([...entries, e("2026-10-03", "all_done", 3), e("2026-10-04", "all_done", 3)], "2026-10-05", { schoolDaysOnly: false })).toBe(4);
  });
  it("is zero with no finished days", () => expect(streak([], "2026-10-05", rules)).toBe(0));
});

describe("streakBonusDue", () => {
  const five = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05"].map((d) => e(d, "all_done", 3));
  it("is due when the streak hits the length", () => {
    expect(streakBonusDue(five, "2026-10-05", rules)).toBe(true);
  });
  it("is not due twice on the same day", () => {
    expect(streakBonusDue([...five, e("2026-10-05", "streak", 5)], "2026-10-05", rules)).toBe(false);
  });
  it("is not due at four", () => {
    expect(streakBonusDue(five.slice(1), "2026-10-05", rules)).toBe(false);
  });
  it("is due again at ten", () => {
    const ten = [...five, ...["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12"].map((d) => e(d, "all_done", 3))];
    expect(streakBonusDue(ten, "2026-10-12", rules)).toBe(true);
    expect(streakBonusDue(ten, "2026-10-09", rules)).toBe(false);
  });
});

describe("goalProgress", () => {
  it("reports fraction, remaining and reached", () => {
    const p = goalProgress([e("2026-10-05", "task", 15)], 20);
    expect(p).toMatchObject({ balance: 15, cost: 20, reached: false, remaining: 5 });
    expect(p.fraction).toBeCloseTo(0.75);
  });
  it("caps the fraction at one and marks reached", () => {
    const p = goalProgress([e("2026-10-05", "adjust", 25)], 20);
    expect(p.fraction).toBe(1);
    expect(p.reached).toBe(true);
  });
  it("never reaches a zero-cost goal", () => {
    expect(goalProgress([e("2026-10-05", "task", 1)], 0).reached).toBe(false);
  });
});

describe("caps and claims", () => {
  it("caps daily task tokens at jobs times tokenPerTask", () => {
    expect(dailyTaskCap(9, rules)).toBe(9);
    expect(dailyTaskCap(9, { tokenPerTask: 2 })).toBe(18);
  });
  it("sums today's task tokens only", () => {
    expect(earnedTodayFromTasks([e("2026-10-05", "task", 1), e("2026-10-04", "task", 1), e("2026-10-05", "all_done", 3)], "2026-10-05")).toBe(1);
  });
  it("claims the cost when affordable, else null", () => {
    expect(claimAmount([e("2026-10-05", "task", 20)], 20)).toBe(-20);
    expect(claimAmount([e("2026-10-05", "task", 19)], 20)).toBeNull();
    expect(claimAmount([e("2026-10-05", "task", 19)], 0)).toBeNull();
  });
});
