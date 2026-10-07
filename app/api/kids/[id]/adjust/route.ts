import { errorResponse, int, json, readJson, str } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { adjustBalance, loadFamily } from "@/lib/family";
import { requirePin } from "@/lib/pin";

export async function POST(request: Request, ctx: RouteContext<"/api/kids/[id]/adjust">) {
  try {
    const { familyId } = await requireFamily();
    const family = await loadFamily(familyId);
    await requirePin(familyId, family.pinHash);
    const { id } = await ctx.params;
    const body = await readJson(request);
    await adjustBalance(familyId, id, int(body.amount, -500, 500), typeof body.note === "string" ? str(body.note, 80) : "");
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
