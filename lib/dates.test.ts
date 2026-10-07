import { describe, expect, it } from "vitest";

import { addDays, hhmmToMinutes, isWeekend, localDate, localMinutes, weekdayOf } from "./dates";

describe("dates", () => {
  it("gives the family-local date across midnight", () => {
    // 23:30 UTC on 5 Oct is already 6 Oct in Auckland and still 5 Oct in London (BST = UTC+1 → 00:30 on 6 Oct, actually).
    const t = new Date("2026-10-05T23:30:00Z");
    expect(localDate("Pacific/Auckland", t)).toBe("2026-10-06");
    expect(localDate("America/Los_Angeles", t)).toBe("2026-10-05");
    expect(localDate("Europe/London", t)).toBe("2026-10-06");
  });
  it("gives minutes since local midnight", () => {
    expect(localMinutes("Europe/London", new Date("2026-10-05T06:30:00Z"))).toBe(7 * 60 + 30);
    expect(localMinutes("UTC", new Date("2026-10-05T00:05:00Z"))).toBe(5);
  });
  it("parses HH:MM", () => {
    expect(hhmmToMinutes("08:15")).toBe(495);
    expect(hhmmToMinutes("7:00")).toBe(420);
    expect(hhmmToMinutes("x")).toBe(0);
  });
  it("knows weekdays and adds days", () => {
    expect(weekdayOf("2026-10-05")).toBe(1);
    expect(isWeekend("2026-10-03")).toBe(true);
    expect(addDays("2026-10-05", -3)).toBe("2026-10-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
