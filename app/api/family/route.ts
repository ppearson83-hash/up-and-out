import { BadRequestError, errorResponse, int, json, readJson, str } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { isValidTimeZone } from "@/lib/dates";
import { loadFamily, updateFamily, type FamilyPatch } from "@/lib/family";
import { requirePin } from "@/lib/pin";

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
    if ("schoolDaysOnly" in body) patch.schoolDaysOnly = Boolean(body.schoolDaysOnly);
    if ("tokenPerTask" in body) patch.tokenPerTask = int(body.tokenPerTask, 0, 10);
    if ("streakLength" in body) patch.streakLength = int(body.streakLength, 0, 30);
    if ("streakBonus" in body) patch.streakBonus = int(body.streakBonus, 0, 50);
    await updateFamily(familyId, patch);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
