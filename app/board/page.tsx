import { redirect } from "next/navigation";

import { Board } from "@/components/Board";
import { auth } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { getState } from "@/lib/family";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const session = await auth();
  const familyId = session?.user?.familyId;
  if (!familyId) redirect("/login");
  const state = await getState(familyId).catch((e: unknown) => { if (e instanceof NotFoundError) redirect("/signout"); throw e; });
  return <Board initial={state} />;
}
