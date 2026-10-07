import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, ".") } },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/.next/**", ".ralph/**"],
    // DB-backed tests share one embedded instance; serialise files.
    fileParallelism: false,
  },
});
