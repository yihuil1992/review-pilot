import { BadRequestException } from "@nestjs/common";
import type { z } from "zod";

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      message: "Invalid request body",
      issues: result.error.issues
    });
  }
  return result.data;
}

