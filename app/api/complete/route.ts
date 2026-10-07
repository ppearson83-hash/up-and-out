import { errorResponse, json, readJson, str } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { completeTask } from "@/lib/family";

export async function POST(request: Request) {
  try {
    const { familyId } = await requireFamily();
    const body = await readJson(request);
    const result = await completeTask(familyId, str(body.kidId), str(body.taskId));
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
