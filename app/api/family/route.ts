import { BadRequestError, errorResponse, int, json, readJson, str } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { isValidTimeZone } from "@/lib/dates";
import { loadFamily, updateFamily, type FamilyPatch } from "@/lib/family";
import { requirePin } from "@/lib/pin";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function PUT(request: Request) {
  try {
    const { familyId } = await requireFamily();
    const family = await loadFamily(familyId);
    await requirePin(familyId, family.pinHash);
    const body = await readJson(request);
    const patch: FamilyPatch = {};
    if ("name" in body) patch.name = str(body.name, 40) || family.name;
    if ("timezone" in body) {
      const tz = str(body.timezone, 60);
      if (!isValidTimeZone(tz)) throw new BadRequestError("unknown timezone");
      patch.timezone = tz;
    }
    for (const key of ["startTime", "leaveTime"] as const) {
      if (key in body) {
        const v = str(body[key], 5);
        if (!HHMM.test(v)) throw new BadRequestError(`${key} must be HH:MM`);
        patch[key] = v;
      }
    }
    if ("schoolDaysOnly" in body) patch.schoolDaysOnly = Boolean(body.schoolDaysOnly);
    if ("tokenPerTask" in body) patch.tokenPerTask = int(body.tokenPerTask, 0, 10);
    if ("allDoneBonus" in body) patch.allDoneBonus = int(body.allDoneBonus, 0, 50);
    if ("streakLength" in body) patch.streakLength = int(body.streakLength, 0, 30);
    if ("streakBonus" in body) patch.streakBonus = int(body.streakBonus, 0, 50);
    await updateFamily(familyId, patch);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
