// `next dev` against the embedded local Prisma Postgres instance. Migrations
// are applied first so a fresh checkout works with no manual steps.
// AUTH_SECRET falls back to a dev-only value; never rely on that in prod.
import { spawnSync } from "node:child_process";

import { runWithRetries, startDb, stopDb } from "./embedded-db.mjs";

const env = {
  AUTH_SECRET: "dev-only-secret-not-for-production",
  AUTH_TRUST_HOST: "true",
  ...process.env,
  DATABASE_URL: startDb(),
};

const migrated = runWithRetries(["prisma", "migrate", "deploy"], env);
if (migrated !== 0) {
  stopDb();
  process.exit(migrated);
}

const result = spawnSync("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});

stopDb();
process.exit(result.status ?? 1);
