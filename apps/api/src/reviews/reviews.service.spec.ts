import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewsService } from "./reviews.service.js";

describe("ReviewsService webhook coverage", () => {
  const prisma = {
    review: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    replyDraft: {
      findFirst: vi.fn()
    }
  };
  const google = {
    publishReply: vi.fn()
  };
  const settings = {
    isPublishTestMode: vi.fn()
  };
  const webhooks = {
    emitForLocation: vi.fn()
  };

  let service: ReviewsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ReviewsService(
      prisma as never,
      {} as never,
      google as never,
      {} as never,
      settings as never,
      {} as never,
      webhooks as never
    );
  });

  it("emits review.updated when any owner or external path marks a review handled", async () => {
    prisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      status: "draft_ready",
      businessLocationId: "location-1"
    });
    prisma.review.update.mockResolvedValue({
      updatedAt: new Date("2026-07-27T12:00:00.000Z")
    });
    vi.spyOn(service, "get").mockResolvedValue({ status: "manual_handled" } as never);

    await service.markManualHandled("review-1", "owner");

    expect(webhooks.emitForLocation).toHaveBeenCalledWith({
      eventType: "review.updated",
      resourceType: "review",
      resourceId: "review-1",
      resourceVersion: "2026-07-27T12:00:00.000Z",
      data: { status: "manual_handled" }
    }, "location-1");
  });

  it("emits publish.succeeded from the shared publish service", async () => {
    prisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      status: "draft_ready",
      businessLocationId: "location-1",
      rating: 5,
      reviewText: "Great",
      publishedReply: null,
      drafts: [{ aiBody: "Thank you!" }]
    });
    prisma.review.update
      .mockResolvedValueOnce({ updatedAt: new Date("2026-07-27T12:00:00.000Z") })
      .mockResolvedValueOnce({ updatedAt: new Date("2026-07-27T12:01:00.000Z") });
    settings.isPublishTestMode.mockResolvedValue(true);
    (service as unknown as { saveLatestDraftEdit: ReturnType<typeof vi.fn> }).saveLatestDraftEdit = vi.fn().mockResolvedValue({
      aiBody: "Thank you!",
      userEdited: false
    });
    vi.spyOn(service, "get").mockResolvedValue({ status: "published" } as never);

    await service.publish("review-1", "Thank you!", "owner");

    expect(webhooks.emitForLocation).toHaveBeenCalledWith({
      eventType: "publish.succeeded",
      resourceType: "review",
      resourceId: "review-1",
      resourceVersion: "2026-07-27T12:01:00.000Z",
      data: { mode: "test", status: "published" }
    }, "location-1");
  });

  it("emits publish.failed when a provider publish attempt fails", async () => {
    prisma.review.findUnique.mockResolvedValue({
      id: "review-1",
      status: "draft_ready",
      businessLocationId: "location-1",
      rating: 5,
      reviewText: "Great",
      publishedReply: null,
      drafts: [{ aiBody: "Thank you!" }]
    });
    prisma.review.update.mockResolvedValue({
      updatedAt: new Date("2026-07-27T12:00:00.000Z")
    });
    settings.isPublishTestMode.mockResolvedValue(false);
    google.publishReply.mockRejectedValue(new Error("Google unavailable"));
    (service as unknown as { saveLatestDraftEdit: ReturnType<typeof vi.fn> }).saveLatestDraftEdit = vi.fn().mockResolvedValue({
      aiBody: "Thank you!",
      userEdited: false
    });
    (service as unknown as { assertPublishAllowed: ReturnType<typeof vi.fn> }).assertPublishAllowed = vi.fn().mockResolvedValue(undefined);

    await expect(service.publish("review-1", "Thank you!", "owner")).rejects.toThrow("Google unavailable");

    expect(webhooks.emitForLocation).toHaveBeenCalledWith({
      eventType: "publish.failed",
      resourceType: "review",
      resourceId: "review-1",
      resourceVersion: expect.any(String),
      data: { mode: "live", error: "Google unavailable" }
    }, "location-1");
  });
});
