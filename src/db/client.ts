import "server-only";

import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * One Postgres, two drivers.
 *
 * Locally there is no database to install: PGlite is Postgres compiled to
 * WebAssembly, writing to ./.pglite. In production DATABASE_URL points at Neon.
 * Both run the same generated migrations, so the SQL is never written twice.
 */

/**
 * The driver-independent handle. Both the PGlite and the Neon clients are
 * Postgres, so the rest of the app only ever sees this shape and never has to
 * branch on which one is behind it.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Serialises start-up across concurrent cold starts on the same database. */
const INIT_LOCK_KEY = 728_193_044;

async function createDatabase(): Promise<{
  db: Database;
  migrate: () => Promise<void>;
}> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { Pool } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");

    const pool = new Pool({ connectionString: url });
    const db = drizzle(pool, { schema });
    return {
      db: db as unknown as Database,
      migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  // `memory://` keeps the database in RAM, which is what the repository tests
  // use so they never touch the developer's own data.
  const client = new PGlite(
    process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".pglite"),
  );
  const db = drizzle(client, { schema });
  return {
    db: db as unknown as Database,
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
  };
}

let initialised: Promise<Database> | null = null;

/**
 * The database, migrated and seeded. The work happens once per process; every
 * caller awaits the same promise.
 */
export function getDb(): Promise<Database> {
  // Hot reload in development replaces the module, so the handle is parked on
  // globalThis to avoid opening a second PGlite on the same directory.
  const globalRef = globalThis as typeof globalThis & {
    __dakhlaDb?: Promise<Database>;
  };

  initialised ??= globalRef.__dakhlaDb ?? null;

  if (!initialised) {
    initialised = (async () => {
      const { db, migrate } = await createDatabase();
      await migrate();
      const { seedIfEmpty } = await import("./seed");
      await seedIfEmpty(db, INIT_LOCK_KEY);
      return db;
    })();
    globalRef.__dakhlaDb = initialised;
  }

  return initialised;
}
