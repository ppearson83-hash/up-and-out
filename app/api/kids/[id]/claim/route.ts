import { errorResponse, json } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { claimGoal, loadFamily } from "@/lib/family";
import { requirePin } from "@/lib/pin";

export async function POST(_request: Request, ctx: RouteContext<"/api/kids/[id]/claim">) {
  try {
    const { familyId } = await requireFamily();
    const family = await loadFamily(familyId);
    await requirePin(familyId, family.pinHash);
    const { id } = await ctx.params;
    return json(await claimGoal(familyId, id));
  } catch (error) {
    return errorResponse(error);
  }
}
