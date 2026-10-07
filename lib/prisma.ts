import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/app/generated/prisma/client";

// One PrismaClient (and one pg pool) per process; dev hot reload re-evaluates
// modules, so the globalThis stash stops every reload opening a new pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Local runs go through scripts/*-with-db.mjs, which inject it.");
  }
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    }),
  });
}

let client: PrismaClient | undefined;

function getClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  if (!client) {
    client = createClient();
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
  }
  return client;
}

// Lazy: `next build` imports route modules with no DATABASE_URL, so the
// client is only constructed on first real use.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const value = Reflect.get(getClient(), prop) as unknown;
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(getClient())
      : value;
  },
});
