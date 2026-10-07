// The parent PIN gate. A correct PIN mints a short-lived HMAC cookie so the
// settings screens work for a while without re-prompting; the API checks the
// cookie, never a client-side flag. Friction for small fingers, not security.
import bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const PIN_COOKIE = "uao_pin";
export const PIN_TTL_SECONDS = 15 * 60;
const PIN_SHAPE = /^\d{4}$/;

export class PinRequiredError extends Error {
  constructor(public readonly reason: "unset" | "missing" | "wrong" = "missing") {
    super(`pin required: ${reason}`);
    this.name = "PinRequiredError";
  }
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

export function isPinShape(v: unknown): v is string {
  return typeof v === "string" && PIN_SHAPE.test(v);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 8);
}

export async function pinMatches(pin: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(pin, hash);
}

/** Cookie value: `<familyId>.<expiresAt>.<hmac>`. */
export function mintPinToken(familyId: string, now = Date.now()): string {
  const exp = String(now + PIN_TTL_SECONDS * 1000);
  const mac = createHmac("sha256", secret()).update(`${familyId}.${exp}`).digest("base64url");
  return `${familyId}.${exp}.${mac}`;
}

export function pinTokenValid(token: string | undefined, familyId: string, now = Date.now()): boolean {
  if (!token) return false;
  const [fid, exp, mac] = token.split(".");
  if (!fid || !exp || !mac || fid !== familyId) return false;
  if (Number(exp) < now) return false;
  const expected = createHmac("sha256", secret()).update(`${fid}.${exp}`).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Settings, claim and adjust handlers call this after requireFamily(). */
export async function requirePin(familyId: string, pinHash: string | null): Promise<void> {
  // No PIN set yet: the family has not been locked, let the parent through
  // so they can set one.
  if (!pinHash) return;
  const jar = await cookies();
  if (!pinTokenValid(jar.get(PIN_COOKIE)?.value, familyId)) throw new PinRequiredError("missing");
}

export async function setPinCookie(familyId: string): Promise<void> {
  const jar = await cookies();
  jar.set(PIN_COOKIE, mintPinToken(familyId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PIN_TTL_SECONDS,
  });
}

export async function clearPinCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(PIN_COOKIE);
}
