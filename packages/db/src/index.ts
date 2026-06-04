import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
export { Prisma, PrismaClient, ReviewPriority, ReviewSeverity, ReviewStatus } from "@prisma/client";
