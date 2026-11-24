import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migrations are generated from the schema and applied at start-up by
  // src/db/client.ts, so no connection string is needed here.
} satisfies Config;
