import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generate/typecheck do not require a database. Existing root migration
  // commands load .env through scripts/with-env.mjs before invoking Prisma.
  datasource: { url: process.env.DATABASE_URL }
});
