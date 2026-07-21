import { HttpException, Injectable, OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { Redis } from "ioredis";

@Injectable()
export class ApiRateLimitService implements OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6380", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });
  private readonly fallback = new Map<string, { count: number; expiresAt: number }>();

  async consume(identifier: string, bucket: string, limit: number, windowSeconds: number, failClosed: boolean) {
    if (process.env.EXTERNAL_API_RATE_LIMIT_ENABLED === "false") {
      return;
    }
    const window = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = `rp:rate:${bucket}:${identifier}:${window}`;
    try {
      if (this.redis.status === "wait") {
        await this.redis.connect();
      }
      const transaction = this.redis.multi();
      transaction.incr(key);
      transaction.expire(key, windowSeconds + 1);
      const result = await transaction.exec();
      const count = Number(result?.[0]?.[1] ?? 0);
      if (count > limit) {
        throw rateLimitError(windowSeconds);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (failClosed) {
        throw new ServiceUnavailableException("Distributed API safety limiter is unavailable");
      }
      this.consumeFallback(key, limit, windowSeconds);
    }
  }

  async onModuleDestroy() {
    if (this.redis.status !== "end") {
      await this.redis.quit().catch(() => this.redis.disconnect());
    }
  }

  private consumeFallback(key: string, limit: number, windowSeconds: number) {
    const now = Date.now();
    const entry = this.fallback.get(key);
    const next = !entry || entry.expiresAt <= now
      ? { count: 1, expiresAt: now + windowSeconds * 1000 }
      : { count: entry.count + 1, expiresAt: entry.expiresAt };
    this.fallback.set(key, next);
    if (next.count > Math.max(1, Math.floor(limit / 4))) {
      throw rateLimitError(windowSeconds);
    }
  }
}

function rateLimitError(retryAfter: number) {
  return new HttpException({ message: "API rate limit exceeded", retryAfter }, 429);
}
