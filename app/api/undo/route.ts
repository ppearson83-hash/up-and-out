import { errorResponse, json, readJson, str } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { undoLast } from "@/lib/family";

export async function POST(request: Request) {
  try {
    const { familyId } = await requireFamily();
    const body = await readJson(request);
    await undoLast(familyId, str(body.kidId));
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
