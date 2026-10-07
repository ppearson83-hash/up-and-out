import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { Settings } from "@/components/Settings";
import { auth } from "@/lib/auth";
import { getState } from "@/lib/family";
import { PIN_COOKIE, pinTokenValid } from "@/lib/pin";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const familyId = session?.user?.familyId;
  if (!familyId) redirect("/login");
  const state = await getState(familyId);
  const jar = await cookies();
  const unlocked = !state.family.hasPin || pinTokenValid(jar.get(PIN_COOKIE)?.value, familyId);
  return <Settings initial={state} parentName={session?.user?.name ?? ""} unlocked={unlocked} />;
}
