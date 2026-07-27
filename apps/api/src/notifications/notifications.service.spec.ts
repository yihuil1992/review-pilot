import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsService } from "./notifications.service.js";

describe("NotificationsService webhook coverage", () => {
  const prisma = {
    review: {
      update: vi.fn(),
      findUnique: vi.fn()
    }
  };
  const webhooks = {
    emitForLocation: vi.fn()
  };

  let service: NotificationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotificationsService(prisma as never, {} as never, webhooks as never);
  });

  it("emits a minimal notification.updated event for owner and external state changes", async () => {
    prisma.review.update.mockResolvedValue({
      id: "review-1",
      notificationStatus: "canceled"
    });
    prisma.review.findUnique.mockResolvedValue({
      businessLocationId: "location-1",
      notificationStatus: "canceled",
      notifyAt: null,
      notificationSentAt: null,
      notificationAttempts: 0,
      notificationLastError: null,
      updatedAt: new Date("2026-07-27T12:00:00.000Z")
    });

    await service.cancel("review-1");

    expect(webhooks.emitForLocation).toHaveBeenCalledWith({
      eventType: "notification.updated",
      resourceType: "review",
      resourceId: "review-1",
      resourceVersion: "2026-07-27T12:00:00.000Z",
      data: {
        notificationStatus: "canceled",
        notifyAt: null,
        notificationSentAt: null,
        notificationAttempts: 0,
        notificationLastError: null
      }
    }, "location-1");
  });
});
