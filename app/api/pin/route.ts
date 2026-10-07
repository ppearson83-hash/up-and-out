import { BadRequestError, errorResponse, json, readJson } from "@/lib/api";
import { requireFamily } from "@/lib/auth/guard";
import { loadFamily } from "@/lib/family";
import { clearPinCookie, hashPin, isPinShape, pinMatches, requirePin, setPinCookie } from "@/lib/pin";
import { prisma } from "@/lib/prisma";

/** Unlock: check the PIN and mint the cookie. */
export async function POST(request: Request) {
  try {
    const { familyId } = await requireFamily();
    const body = await readJson(request);
    const family = await loadFamily(familyId);
    if (!family.pinHash) {
      await setPinCookie(familyId);
      return json({ ok: true, unset: true });
    }
    if (!isPinShape(body.pin) || !(await pinMatches(body.pin, family.pinHash))) {
      return json({ error: "wrong_pin" }, { status: 403 });
    }
    await setPinCookie(familyId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Set or change the PIN. Needs an unlocked cookie when one is already set. */
export async function PUT(request: Request) {
  try {
    const { familyId } = await requireFamily();
    const family = await loadFamily(familyId);
    await requirePin(familyId, family.pinHash);
    const body = await readJson(request);
    if (!isPinShape(body.pin)) throw new BadRequestError("pin must be four digits");
    await prisma.family.update({ where: { id: familyId }, data: { pinHash: await hashPin(body.pin) } });
    await setPinCookie(familyId);
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Lock: drop the cookie. */
export async function DELETE() {
  try {
    await requireFamily();
    await clearPinCookie();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
