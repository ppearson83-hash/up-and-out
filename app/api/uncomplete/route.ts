import { errorResponse, json, readJson, str } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { uncompleteTask } from "@/lib/family";

export async function POST(request: Request) {
  try {
    const { familyId } = await requireFamily();
    const body = await readJson(request);
    await uncompleteTask(familyId, str(body.kidId), str(body.taskId));
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
