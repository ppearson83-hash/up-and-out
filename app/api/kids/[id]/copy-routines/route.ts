import { errorResponse, json, readJson, str } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { copyRoutines, loadFamily } from "@/lib/family";
import { requirePin } from "@/lib/pin";

/** Copy this kid's routines and jobs onto another kid, replacing theirs. */
export async function POST(request: Request, ctx: RouteContext<"/api/kids/[id]/copy-routines">) {
  try {
    const { familyId } = await requireFamily();
    const family = await loadFamily(familyId);
    await requirePin(familyId, family.pinHash);
    const { id } = await ctx.params;
    const body = await readJson(request);
    await copyRoutines(familyId, id, str(body.toKidId));
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
