import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      // src/db/client.ts is server-only; tests that exercise the repository
      // against in-memory PGlite must be able to import it.
      "server-only": resolve(__dirname, "./test/stubs/server-only.ts"),
    },
  },
  test: {
    // Repository tests run against an in-memory Postgres, never the ./.pglite
    // database a developer has been clicking around in.
    env: { PGLITE_DATA_DIR: "memory://" },
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
  },
});
