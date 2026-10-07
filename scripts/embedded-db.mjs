// The embedded local Prisma Postgres instance shared by every `*-with-db`
// wrapper. It is named "clubpot" (not "default") so it never collides with
// other projects on this machine using the same pattern (clubpot etc.), and its URL is only
// ever injected into a child process's env — never written to .env. See the
// "No local Postgres/docker" note in CLAUDE.md for why.
import { execFileSync, spawnSync } from "node:child_process";

const INSTANCE = "up-and-out";

// Built from a char code rather than an escape literal: writing "\x1b" through
// the agent's file tools can land as a literal control byte in the source
// (see the CLAUDE.md gotcha).
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/**
 * Starts (or reuses) the instance and returns its connection URL.
 *
 * Restarting right after another wrapper stopped the SAME instance can
 * transiently fail ("Lock file is already being held" / ECONNREFUSED) until
 * the daemon releases its lock — hence the retry.
 */
export function startDb(attempt = 1) {
  let output;
  try {
    output = execFileSync(
      "npx",
      ["prisma", "dev", "--name", INSTANCE, "--detach"],
      { encoding: "utf8" },
    );
  } catch (error) {
    if (attempt >= 6) throw error;
    execFileSync("sleep", ["2"]);
    return startDb(attempt + 1);
  }

  // `prisma dev` colourises its output even when stdout is a pipe, and the
  // closing reset of a preceding notice ("Fetching latest updates for this
  // subcommand…", the version banner) lands at the START of the URL line —
  // so strip escapes and match the URL anywhere in the line rather than
  // requiring it at position 0. Observed 2026-08-28, when an auto-update of
  // the `dev` subcommand broke every wrapper at once.
  const url = output
    .replace(ANSI, "")
    .split("\n")
    .map((line) => /postgres(?:ql)?:\/\/\S+/.exec(line)?.[0])
    .find(Boolean);

  if (!url) {
    throw new Error(
      `Could not parse DATABASE_URL from \`prisma dev\` output:\n${output}`,
    );
  }
  return url;
}

export function stopDb() {
  spawnSync("npx", ["prisma", "dev", "stop", INSTANCE], { stdio: "inherit" });
}

/**
 * A fresh instance starts with no tables, so committed migrations are applied
 * before anything else (a no-op when already up to date). `--detach`
 * returning a URL doesn't guarantee Postgres accepts connections yet, so the
 * first attempt can still get ECONNREFUSED — retry briefly.
 *
 * Returns the exit status; the caller decides whether to stop the instance.
 */
export function runWithRetries(args, env, attempts = 4) {
  let result;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    result = spawnSync("npx", args, { stdio: "inherit", env });
    if (result.status === 0 || attempt === attempts) break;
    execFileSync("sleep", ["2"]);
  }
  return result.status ?? 1;
}
