import { errorResponse, json } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { getState } from "@/lib/family";

export async function GET() {
  try {
    const { familyId } = await requireFamily();
    return json(await getState(familyId));
  } catch (error) {
    return errorResponse(error);
  }
}
