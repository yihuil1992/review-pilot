import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import type { PrismaService } from "./prisma.service.js";

const redis = vi.hoisted(() => ({
  on: vi.fn(), connect: vi.fn(async () => undefined),
  ping: vi.fn(async () => "PONG"), disconnect: vi.fn()
}));
vi.mock("ioredis", () => ({ Redis: class { constructor() { return redis; } } }));

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("dependency readiness", () => {
  it("checks both PostgreSQL and Redis and closes its probe connection", async () => {
    const query = vi.fn(async () => [{ value: 1 }]);
    const controller = new HealthController({ $queryRaw: query } as unknown as PrismaService);
    expect(await controller.ready()).toMatchObject({ ok: true, checks: { postgres: "ready", redis: "ready" } });
    expect(query).toHaveBeenCalled();
    expect(redis.ping).toHaveBeenCalled();
    expect(redis.disconnect).toHaveBeenCalled();
  });

  it("returns unavailable without leaking connection errors", async () => {
    const query = vi.fn(async () => { throw new Error("private connection detail"); });
    const controller = new HealthController({ $queryRaw: query } as unknown as PrismaService);
    await expect(controller.ready()).rejects.toThrow("Application dependencies are unavailable");
  });

  it("bounds an unresponsive dependency check", async () => {
    vi.useFakeTimers();
    const controller = new HealthController({ $queryRaw: () => new Promise(() => {}) } as unknown as PrismaService);
    const assertion = expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await vi.advanceTimersByTimeAsync(1501);
    await assertion;
    expect(redis.disconnect).toHaveBeenCalled();
  });
});
