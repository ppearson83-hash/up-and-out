// Every exported handler under app/api must call requireFamily() in its own
// body, or carry an `// allowAnonymous: <reason>` comment in the file.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

const root = path.resolve(import.meta.dirname, "..", "app", "api");
const routes = walk(root);

describe("api guards", () => {
  it("finds routes", () => expect(routes.length).toBeGreaterThan(5));
  for (const file of routes) {
    it(path.relative(root, file), () => {
      const src = readFileSync(file, "utf8");
      if (/\/\/ allowAnonymous: \S/.test(src)) return;
      const handlers = src.split(/export async function (GET|POST|PUT|DELETE|PATCH)\b/).slice(1);
      expect(handlers.length).toBeGreaterThan(0);
      for (let i = 1; i < handlers.length; i += 2) {
        const body = handlers[i];
        expect(body, `${handlers[i - 1]} must call requireFamily()`).toMatch(/await requireFamily\(\)/);
      }
    });
  }
});
