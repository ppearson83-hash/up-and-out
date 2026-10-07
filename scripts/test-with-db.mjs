// Runs vitest against this project's embedded local Prisma Postgres instance,
// with its connection URL injected as DATABASE_URL for that child process
// only. Never touches .env — see scripts/embedded-db.mjs.
import { spawnSync } from "node:child_process";

import { runWithRetries, startDb, stopDb } from "./embedded-db.mjs";

// Regenerate the client first so tests always run against the current
// schema — postinstall only covers fresh installs, not schema edits or
// branch switches. No DB connection needed for generate.
const generateResult = spawnSync("npx", ["prisma", "generate"], {
  stdio: "inherit",
});
if (generateResult.status !== 0) {
  process.exit(generateResult.status ?? 1);
}

const env = { ...process.env, DATABASE_URL: startDb() };

const migrateStatus = runWithRetries(["prisma", "migrate", "deploy"], env);
if (migrateStatus !== 0) {
  stopDb();
  process.exit(migrateStatus);
}

const result = spawnSync("npx", ["vitest", "run", ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});

stopDb();

process.exit(result.status ?? 1);
