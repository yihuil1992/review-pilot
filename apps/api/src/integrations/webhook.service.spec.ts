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
      findUnique: vi.fn()
    },
    webhookDelivery: {
      findMany: vi.fn()
    }
  };

  let service: WebhookService;

  beforeEach(() => {
    vi.clearAllMocks();
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
