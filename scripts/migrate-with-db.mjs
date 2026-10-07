// Runs `prisma migrate dev` against the embedded local Prisma Postgres
// instance. Extra CLI args pass through (e.g.
// `npm run db:migrate -- --name add_pledges`). See scripts/embedded-db.mjs.
import { spawnSync } from "node:child_process";

import { startDb, stopDb } from "./embedded-db.mjs";

const result = spawnSync(
  "npx",
  ["prisma", "migrate", "dev", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: startDb() },
  },
);

stopDb();

process.exit(result.status ?? 1);
