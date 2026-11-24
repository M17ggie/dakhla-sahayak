// Deletes the local PGlite database. It is re-created and re-seeded on the next request.
import { rm } from "node:fs/promises";

await rm(new URL("../.pglite", import.meta.url), { recursive: true, force: true });
console.log("Local database removed. Run `npm run dev` to re-create it with fresh demo data.");
