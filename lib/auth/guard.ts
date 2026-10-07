import { auth } from "@/lib/auth";
import { UnauthenticatedError } from "@/lib/errors";

export type FamilySession = { userId: string; familyId: string; name: string };

/** Every API handler calls this first. Throws when there is no parent session. */
export async function requireFamily(): Promise<FamilySession> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.familyId) throw new UnauthenticatedError();
  return { userId: user.id, familyId: user.familyId, name: user.name ?? "" };
}
