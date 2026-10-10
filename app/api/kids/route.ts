import { BadRequestError, errorResponse, int, json, readJson, str } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { isDateString } from "@/lib/dates";
import { loadFamily, MAX_TASKS, saveKids, taskKey, type KidInput, type RoutineInput, type TaskInput } from "@/lib/family";
import { requirePin } from "@/lib/pin";
import { isColourKey, isTokenKey } from "@/lib/themes";

const MAX_KIDS = 6, MAX_ROUTINES = 6;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function days(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out = v.map((d) => int(d, 0, 6));
  return [...new Set(out)].sort();
}

function hhmm(v: unknown, field: string): string {
  const s = str(v, 5);
  if (!HHMM.test(s)) throw new BadRequestError(`${field} must be HH:MM`);
  return s;
}

function task(raw: unknown): TaskInput {
  if (!raw || typeof raw !== "object") throw new BadRequestError("bad job");
  const t = raw as Record<string, unknown>;
  const label = str(t.label, 40);
  if (!label) throw new BadRequestError("job needs a label");
  const date = t.date == null || t.date === "" ? null : str(t.date, 10);
  if (date !== null && !isDateString(date)) throw new BadRequestError("job date must be YYYY-MM-DD");
  return { label, days: date ? [] : days(t.days), date };
}

function routine(raw: unknown): RoutineInput {
  if (!raw || typeof raw !== "object") throw new BadRequestError("bad routine");
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 30);
  if (!name) throw new BadRequestError("routine needs a name");
  const startTime = hhmm(r.startTime, "start"), endTime = hhmm(r.endTime, "end");
  if (endTime <= startTime) throw new BadRequestError(`${name}: end must be after start`);
  const tasksRaw = Array.isArray(r.tasks) ? r.tasks : [];
  const seen = new Set<string>();
  const tasks = tasksRaw.map(task).filter((t) => (seen.has(taskKey(t)) ? false : (seen.add(taskKey(t)), true)));
  if (tasks.length > MAX_TASKS) throw new BadRequestError(`${name}: at most ${MAX_TASKS} jobs per routine`);
  return { id: typeof r.id === "string" ? r.id : undefined, name, startTime, endTime, days: days(r.days), bonus: "bonus" in r ? int(r.bonus, 0, 50) : 2, streak: Boolean(r.streak), tasks };
}

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
      const routines = Array.isArray(k.routines) ? k.routines.map(routine).slice(0, MAX_ROUTINES) : [];
      if (routines.length === 0) throw new BadRequestError(`${name} needs at least one routine`);
      return {
        id: typeof k.id === "string" ? k.id : undefined,
        name,
        colour: isColourKey(k.colour) ? k.colour : "marigold",
        theme: isTokenKey(k.theme) ? k.theme : "star",
        goalName: typeof k.goalName === "string" ? str(k.goalName, 40) : "",
        goalCost: "goalCost" in k ? int(k.goalCost, 0, 1000) : 20,
        routines,
      };
    });
    await saveKids(familyId, kids);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
