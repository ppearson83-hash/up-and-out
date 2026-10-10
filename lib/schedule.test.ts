import { describe, expect, it } from "vitest";

import { formatTaskLine, isRoutineScheduled, isTaskScheduled, parseTaskLine, routineStatus } from "./schedule";

const weekdays = { days: [1, 2, 3, 4, 5], startTime: "07:00", endTime: "08:15" };

describe("parseTaskLine", () => {
  const today = "2026-10-09"; // Friday
  it("reads plain labels", () => expect(parseTaskLine("Brush teeth", today)).toEqual({ label: "Brush teeth", days: [], date: null }));
  it("reads weekday suffixes", () => {
    expect(parseTaskLine("Swimming kit (Tue)", today)).toEqual({ label: "Swimming kit", days: [2], date: null });
    expect(parseTaskLine("Spellings (Mon, Thu)", today)).toEqual({ label: "Spellings", days: [1, 4], date: null });
    expect(parseTaskLine("PE (monday/wednesday)", today)).toEqual({ label: "PE", days: [1, 3], date: null });
  });
  it("reads dates, rolling to next year when passed", () => {
    expect(parseTaskLine("Dentist form (14 Oct)", today)).toEqual({ label: "Dentist form", days: [], date: "2026-10-14" });
    expect(parseTaskLine("Costume (3 Mar)", today)).toEqual({ label: "Costume", days: [], date: "2027-03-03" });
    expect(parseTaskLine("Trip (2026-12-01)", today)).toEqual({ label: "Trip", days: [], date: "2026-12-01" });
  });
  it("leaves other brackets alone", () => {
    expect(parseTaskLine("Read (20 minutes)", today)).toEqual({ label: "Read (20 minutes)", days: [], date: null });
    expect(parseTaskLine("", today)).toBeNull();
  });
  it("round-trips through formatTaskLine", () => {
    for (const line of ["Brush teeth", "Swimming kit (Tue)", "Spellings (Mon, Thu)", "Dentist form (14 Oct)"]) {
      expect(formatTaskLine(parseTaskLine(line, today)!, today)).toBe(line);
    }
  });
  it("writes the year for a date outside this year so it re-parses unchanged", () => {
    const line = formatTaskLine({ label: "Costume", days: [], date: "2027-03-03" }, today);
    expect(line).toBe("Costume (3 Mar 2027)");
    expect(parseTaskLine(line, today)).toEqual({ label: "Costume", days: [], date: "2027-03-03" });
    const past = formatTaskLine({ label: "Old", days: [], date: "2025-11-02" }, today);
    expect(parseTaskLine(past, today)?.date).toBe("2025-11-02");
  });
});

describe("scheduling", () => {
  it("applies routine days unless the task narrows them", () => {
    expect(isTaskScheduled({ days: [], date: null }, weekdays, "2026-10-09")).toBe(true);
    expect(isTaskScheduled({ days: [], date: null }, weekdays, "2026-10-10")).toBe(false);
    expect(isTaskScheduled({ days: [2], date: null }, weekdays, "2026-10-09")).toBe(false);
    expect(isTaskScheduled({ days: [5], date: null }, weekdays, "2026-10-09")).toBe(true);
    // A job's days cannot add a day the routine does not run on.
    expect(isTaskScheduled({ days: [6], date: null }, weekdays, "2026-10-10")).toBe(false);
    expect(isTaskScheduled({ days: [], date: "2026-10-10" }, weekdays, "2026-10-10")).toBe(true);
    expect(isTaskScheduled({ days: [], date: null, active: false }, weekdays, "2026-10-09")).toBe(false);
  });
  it("runs a routine on its days or when a one-off falls today", () => {
    expect(isRoutineScheduled({ ...weekdays, tasks: [] }, "2026-10-10")).toBe(false);
    expect(isRoutineScheduled({ ...weekdays, tasks: [{ days: [], date: "2026-10-10" }] }, "2026-10-10")).toBe(true);
  });
  it("reports routine status by the clock", () => {
    expect(routineStatus(weekdays, 6 * 60)).toBe("upcoming");
    expect(routineStatus(weekdays, 7 * 60 + 30)).toBe("live");
    expect(routineStatus(weekdays, 9 * 60)).toBe("over");
  });
});
