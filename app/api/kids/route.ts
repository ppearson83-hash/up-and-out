import { BadRequestError, errorResponse, int, json, readJson, str } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { loadFamily, saveKids, type KidInput } from "@/lib/family";
import { requirePin } from "@/lib/pin";
import { isColourKey, isTokenKey } from "@/lib/themes";

const MAX_KIDS = 6;
const MAX_TASKS = 16;

export async function PUT(request: Request) {
  try {
    const { familyId } = await requireFamily();
    const family = await loadFamily(familyId);
    await requirePin(familyId, family.pinHash);
    const body = await readJson(request);
    if (!Array.isArray(body.kids) || body.kids.length === 0 || body.kids.length > MAX_KIDS) {
      throw new BadRequestError(`kids must be a list of 1 to ${MAX_KIDS}`);
    }
    const kids: KidInput[] = body.kids.map((raw: unknown) => {
      if (!raw || typeof raw !== "object") throw new BadRequestError("bad kid");
      const k = raw as Record<string, unknown>;
      const name = str(k.name, 20);
      if (!name) throw new BadRequestError("kid needs a name");
      const tasks = Array.isArray(k.tasks)
        ? [...new Set(k.tasks.map((t: unknown) => str(t, 40)).filter(Boolean))].slice(0, MAX_TASKS)
        : [];
      return {
        id: typeof k.id === "string" ? k.id : undefined,
        name,
        colour: isColourKey(k.colour) ? k.colour : "marigold",
        theme: isTokenKey(k.theme) ? k.theme : "star",
        goalName: typeof k.goalName === "string" ? str(k.goalName, 40) : "",
        goalCost: "goalCost" in k ? int(k.goalCost, 0, 1000) : 20,
        tasks,
      };
    });
    await saveKids(familyId, kids);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
