import { errorResponse, json, readJson, str } from "@/lib/api";
import { createUser, SignupError } from "@/lib/auth/passwords";

// allowAnonymous: creating the first parent account
export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const password = typeof body.password === "string" ? body.password : "";
    const user = await createUser({
      email: str(body.email, 200),
      name: str(body.name, 40),
      password,
      familyName: typeof body.familyName === "string" ? str(body.familyName, 40) : undefined,
      invite: typeof body.invite === "string" && body.invite.trim() ? str(body.invite, 16) : undefined,
    });
    return json({ ok: true, id: user.id });
  } catch (error) {
    if (error instanceof SignupError) return json({ error: error.code }, { status: 400 });
    return errorResponse(error);
  }
}
