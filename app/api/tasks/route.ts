import { BadRequestError, errorResponse, json, readJson, str } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { isDateString } from "@/lib/dates";
import { addOneOff, loadFamily } from "@/lib/family";
import { requirePin } from "@/lib/pin";

/** Add a one-off dated job to a routine. */
export async function POST(request: Request) {
  try {
    const { familyId } = await requireFamily();
    const family = await loadFamily(familyId);
    await requirePin(familyId, family.pinHash);
    const body = await readJson(request);
    const label = str(body.label, 40);
    if (!label) throw new BadRequestError("job needs a label");
    const date = str(body.date, 10);
    if (!isDateString(date)) throw new BadRequestError("date must be YYYY-MM-DD");
    await addOneOff(familyId, str(body.routineId), label, date);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
