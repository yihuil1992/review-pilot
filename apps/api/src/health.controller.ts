import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { Redis } from "ioredis";
import { PrismaService } from "./prisma.service.js";

@Controller()
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get("health")
  health() {
    return {
      ok: true,
      service: "review-pilot-api",
      timestamp: new Date().toISOString()
    };
  }

  @Get("ready")
  async ready() {
    const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380", {
      lazyConnect: true,
      connectTimeout: 1000,
      commandTimeout: 1000,
      retryStrategy: () => null,
      maxRetriesPerRequest: 0
    });
    redis.on("error", () => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([
          this.prisma.$queryRaw`SELECT 1`,
          redis.connect().then(() => redis.ping())
        ]),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Dependency check timed out")), 1500);
        })
      ]);
      return {
        ok: true,
        checks: { api: "ready", postgres: "ready", redis: "ready" },
        trialMode: process.env.REVIEW_PILOT_TRIAL_MODE === "true"
      };
    } catch {
      throw new ServiceUnavailableException("Application dependencies are unavailable");
    } finally {
      clearTimeout(timer);
      redis.disconnect();
    }
  }
}

