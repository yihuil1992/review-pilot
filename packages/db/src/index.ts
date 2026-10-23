import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as GeneratedPrismaClient } from "./generated/prisma/client.js";

// Imports and mocked tests remain connection-free. Refuse a missing URL before
// the first connection, instead of letting node-postgres use ambient PG* defaults.
class DatabaseAdapter extends PrismaPg {
  constructor(private readonly databaseUrl: string | undefined) {
    const schema = databaseUrl ? new URL(databaseUrl).searchParams.get("schema") ?? "public" : "public";
    super({
      connectionString: databaseUrl,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 300_000
    }, { schema });
  }

  override async connect() {
    if (!this.databaseUrl) throw new Error("DATABASE_URL is required for database connections");
    return super.connect();
  }
}

export class PrismaClient extends GeneratedPrismaClient {
  constructor() {
    super({ adapter: new DatabaseAdapter(process.env.DATABASE_URL) });
  }
}

export const prisma = new PrismaClient();
export { Prisma, ReviewPriority, ReviewSeverity, ReviewStatus } from "./generated/prisma/client.js";
