import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationUpdatedWebhookData, requiredWebhookEventScope } from "@review-pilot/shared";
import { WebhookEmitterService } from "./webhook-emitter.service.js";

const queueAdd = vi.fn();
const queueClose = vi.fn();

vi.mock("bullmq", () => ({
  Queue: class {
    add = queueAdd;
    close = queueClose;
  }
}));

describe("WebhookEmitterService event routing", () => {
  const prisma = {
    webhookEndpoint: {
      findMany: vi.fn()
    },
    webhookDelivery: {
      create: vi.fn()
    },
    $transaction: vi.fn()
  };

  let service: WebhookEmitterService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.webhookEndpoint.findMany.mockResolvedValue([]);
    service = new WebhookEmitterService(prisma as never);
  });

  it("routes background resource events by active location grants", async () => {
    await service.emitForLocation("location-1", {
      eventType: "review.created",
      resourceType: "review",
      resourceId: "review-1",
      resourceVersion: "2026-07-27T12:00:00.000Z",
      data: { rating: 5 }
    });

    expect(prisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: {
        active: true,
        events: { has: "review.created" },
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

  it("excludes revoked clients from caller-specific events", async () => {
    await service.emit("client-1", {
      eventType: "sync.completed",
      resourceType: "location",
      resourceId: "location-1",
      resourceVersion: "2026-07-27T12:00:00.000Z",
      data: { created: 1 }
    });

    expect(prisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: {
        apiClientId: "client-1",
        active: true,
        events: { has: "sync.completed" },
        apiClient: {
          is: {
            revokedAt: null,
            scopes: { has: "sync:run" }
          }
        }
      }
    });
  });

  it("does not fail a completed worker job when webhook infrastructure is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    prisma.webhookEndpoint.findMany.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(service.emitForLocation("location-1", {
      eventType: "draft.ready",
      resourceType: "review",
      resourceId: "review-1",
      resourceVersion: "2026-07-27T12:00:00.000Z",
      data: { draftVersion: 1 }
    })).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("notificationUpdatedWebhookData", () => {
  it("returns only the public notification state projection", () => {
    const data = notificationUpdatedWebhookData({
      notificationStatus: "sent",
      notifyAt: new Date("2026-07-27T12:00:00.000Z"),
      notificationSentAt: new Date("2026-07-27T12:05:00.000Z"),
      notificationAttempts: 1,
      notificationLastError: null
    });

    expect(data).toEqual({
      notificationStatus: "sent",
      notifyAt: "2026-07-27T12:00:00.000Z",
      notificationSentAt: "2026-07-27T12:05:00.000Z",
      notificationAttempts: 1,
      notificationLastError: null
    });
    expect(data).not.toHaveProperty("reviewUrl");
    expect(data).not.toHaveProperty("sid");
  });
});

describe("requiredWebhookEventScope", () => {
  it("keeps event subscriptions inside API Client function scopes", () => {
    expect(requiredWebhookEventScope("review.created")).toBe("reviews:read");
    expect(requiredWebhookEventScope("draft.ready")).toBe("reviews:read");
    expect(requiredWebhookEventScope("notification.updated")).toBe("notifications:read");
    expect(requiredWebhookEventScope("sync.completed")).toBe("sync:run");
  });
});
