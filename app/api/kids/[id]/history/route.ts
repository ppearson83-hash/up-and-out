import { errorResponse, json } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { history, loadFamily } from "@/lib/family";
import { requirePin } from "@/lib/pin";

export async function GET(_request: Request, ctx: RouteContext<"/api/kids/[id]/history">) {
  try {
    const { familyId } = await requireFamily();
    const family = await loadFamily(familyId);
    await requirePin(familyId, family.pinHash);
    const { id } = await ctx.params;
    return json({ rows: await history(familyId, id) });
  } catch (error) {
    return errorResponse(error);
  }
}
