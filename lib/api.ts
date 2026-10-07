// JSON helpers and the one place API errors become HTTP statuses.
import { NextResponse } from "next/server";

import { BadRequestError, NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { PinRequiredError } from "@/lib/pin";

export { BadRequestError, NotFoundError } from "@/lib/errors";

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, { ...init, headers: { "cache-control": "no-store", ...init?.headers } });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) return json({ error: "unauthenticated" }, { status: 401 });
  if (error instanceof PinRequiredError) return json({ error: "pin_required", reason: error.reason }, { status: 403 });
  if (error instanceof BadRequestError) return json({ error: "bad_request", message: error.message }, { status: 400 });
  if (error instanceof NotFoundError) return json({ error: "not_found" }, { status: 404 });
  console.error(error);
  return json({ error: "server_error" }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new BadRequestError("expected a JSON object body");
}

export function str(v: unknown, max = 60): string {
  if (typeof v !== "string") throw new BadRequestError("expected a string");
  return v.trim().slice(0, max);
}

export function int(v: unknown, min: number, max: number): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    throw new BadRequestError(`expected an integer between ${min} and ${max}`);
  }
  return n;
}
