import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Every page in this app is per-user and changes after every action, so there is
  // nothing worth caching between requests. Request-time rendering keeps the data
  // correct without cache invalidation plumbing.
  cacheComponents: false,
  // PGlite ships its own WebAssembly build and reads the data directory through
  // Node's fs directly. Bundling it breaks both, so it is loaded as a plain
  // dependency at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  // The migration files are read at start-up, so they must be traced into the
  // serverless bundle alongside the code.
  outputFileTracingIncludes: {
    "/**": ["./drizzle/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
