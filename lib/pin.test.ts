import { beforeAll, describe, expect, it } from "vitest";

import { isPinShape, mintPinToken, pinTokenValid } from "./pin";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret";
});

describe("pin token", () => {
  it("validates a fresh token for its family only", () => {
    const t = mintPinToken("fam1", 1_000_000);
    expect(pinTokenValid(t, "fam1", 1_000_000 + 60_000)).toBe(true);
    expect(pinTokenValid(t, "fam2", 1_000_000 + 60_000)).toBe(false);
  });
  it("expires", () => {
    const t = mintPinToken("fam1", 1_000_000);
    expect(pinTokenValid(t, "fam1", 1_000_000 + 16 * 60 * 1000)).toBe(false);
  });
  it("rejects tampering and garbage", () => {
    const t = mintPinToken("fam1", 1_000_000);
    const [fid, exp, mac] = t.split(".");
    expect(pinTokenValid(`${fid}.${Number(exp) + 999999}.${mac}`, "fam1", 1_000_000)).toBe(false);
    expect(pinTokenValid("nope", "fam1")).toBe(false);
    expect(pinTokenValid(undefined, "fam1")).toBe(false);
  });
  it("accepts only four digits as a pin", () => {
    expect(isPinShape("1234")).toBe(true);
    expect(isPinShape("123")).toBe(false);
    expect(isPinShape("12a4")).toBe(false);
  });
});
