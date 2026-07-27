import { NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookService } from "./webhook.service.js";

const queueAdd = vi.fn();
const queueClose = vi.fn();

vi.mock("bullmq", () => ({
  Queue: class {
    add = queueAdd;
    close = queueClose;
  }
}));

describe("WebhookService delivery inspection", () => {
  const prisma = {
    webhookEndpoint: {
      findUnique: vi.fn(),
      findMany: vi.fn()
    },
    webhookDelivery: {
      findMany: vi.fn(),
      create: vi.fn()
    },
    $transaction: vi.fn()
  };

  let service: WebhookService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.webhookEndpoint.findMany.mockResolvedValue([]);
    service = new WebhookService(prisma as never, {} as never);
  });

  it("returns the newest delivery metadata without stored payloads", async () => {
    prisma.webhookEndpoint.findUnique.mockResolvedValue({ id: "endpoint-1" });
    prisma.webhookDelivery.findMany.mockResolvedValue([
      {
        id: "delivery-1",
        endpointId: "endpoint-1",
        eventId: "event-1",
        eventType: "review.created",
        payload: { reviewText: "must stay private" },
        status: "failed",
        attempts: 6,
        nextAttemptAt: null,
        lastError: "Webhook endpoint returned 500",
        deliveredAt: null,
        createdAt: new Date("2026-07-27T12:00:00.000Z"),
        updatedAt: new Date("2026-07-27T12:05:00.000Z")
      }
    ]);

    const result = await service.listDeliveries("endpoint-1");

    expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith({
      where: { endpointId: "endpoint-1" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        eventId: true,
        eventType: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        lastError: true,
        deliveredAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
    expect(result).toEqual([
      {
        id: "delivery-1",
        eventId: "event-1",
        eventType: "review.created",
        status: "failed",
        attempts: 6,
        nextAttemptAt: null,
        lastError: "Webhook endpoint returned 500",
        deliveredAt: null,
        createdAt: "2026-07-27T12:00:00.000Z",
        updatedAt: "2026-07-27T12:05:00.000Z"
      }
    ]);
    expect(result[0]).not.toHaveProperty("payload");
    expect(result[0]).not.toHaveProperty("endpointId");
  });

  it("rejects delivery inspection for an unknown endpoint", async () => {
    prisma.webhookEndpoint.findUnique.mockResolvedValue(null);

    await expect(service.listDeliveries("missing")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.webhookDelivery.findMany).not.toHaveBeenCalled();
  });
});

describe("WebhookService event routing", () => {
  const prisma = {
    webhookEndpoint: {
      findMany: vi.fn()
    },
    webhookDelivery: {
      create: vi.fn()
    },
    $transaction: vi.fn()
  };

  let service: WebhookService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.webhookEndpoint.findMany.mockResolvedValue([]);
    service = new WebhookService(prisma as never, {} as never);
  });

  it("routes resource events only to active clients authorized for the location", async () => {
    await service.emitForLocation({
      eventType: "draft.ready",
      resourceType: "review",
      resourceId: "review-1",
      resourceVersion: "2026-07-27T12:00:00.000Z",
      data: { draftVersion: 1 }
    }, "location-1");

    expect(prisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: {
        active: true,
        events: { has: "draft.ready" },
        apiClient: {
          is: {
            revokedAt: null,
            scopes: { has: "reviews:read" },
            OR: [
              { allLocations: true },
              { locationGrants: { some: { locationId: "location-1" } } }
            ]
          }
        }
      }
    });
  });

  it("does not target a revoked client for caller-specific events", async () => {
    await service.emit({
      eventType: "sync.completed",
      resourceType: "location",
      resourceId: "location-1",
      resourceVersion: "2026-07-27T12:00:00.000Z",
      data: { created: 1 }
    }, "client-1");

    expect(prisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: {
        active: true,
        events: { has: "sync.completed" },
        apiClientId: "client-1",
        apiClient: {
          is: {
            revokedAt: null,
            scopes: { has: "sync:run" }
          }
        }
      }
    });
  });

  it("does not fail completed domain work when webhook infrastructure is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    prisma.webhookEndpoint.findMany.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.emitForLocation({
      eventType: "publish.succeeded",
      resourceType: "review",
      resourceId: "review-1",
      resourceVersion: "2026-07-27T12:00:00.000Z",
      data: { mode: "live" }
    }, "location-1")).resolves.toEqual({ eventId: null, deliveries: 0 });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
