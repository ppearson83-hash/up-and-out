// Browser-side helpers shared by the board and settings screens.
import type { FamilyState } from "@/lib/family";

export type { FamilyState };

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message?: string) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, d.error ?? "error", d.message);
  }
  return data as T;
}

export function fmtTime(mins: number): string {
  const h = Math.floor(mins / 60), m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}
