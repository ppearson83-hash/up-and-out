// Vercel build: apply migrations, then build. Shipping code ahead of its
// schema is worse than a failed build, so a migration failure is fatal.
import { spawnSync } from "node:child_process";

function run(command, args) {
  return spawnSync(command, args, { stdio: "inherit", shell: false, env: process.env });
}

let migrated = false;
for (let attempt = 1; attempt <= 3; attempt++) {
  if (run("npx", ["prisma", "migrate", "deploy"]).status === 0) { migrated = true; break; }
  console.warn(`prisma migrate deploy failed (attempt ${attempt}/3)`);
  spawnSync("sleep", ["5"]);
}
if (!migrated) {
  console.error("prisma migrate deploy failed after every attempt — refusing to build.");
  process.exit(1);
}
process.exit(run("npx", ["next", "build"]).status ?? 1);
