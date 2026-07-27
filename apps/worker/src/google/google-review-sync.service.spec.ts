import { describe, expect, it } from "vitest";
import { reviewProviderFieldsChanged } from "./google-review-sync.service.js";

const baseline = {
  authorName: "Customer",
  rating: 5,
  reviewText: "Great",
  reviewCreatedAt: new Date("2026-07-27T12:00:00.000Z"),
  publishedReply: null,
  replyPublishedAt: null
};

describe("reviewProviderFieldsChanged", () => {
  it("does not treat an unchanged periodic sighting as an update", () => {
    expect(reviewProviderFieldsChanged(baseline, {
      ...baseline,
      reviewCreatedAt: new Date("2026-07-27T12:00:00.000Z")
    })).toBe(false);
  });

  it("detects provider field changes", () => {
    expect(reviewProviderFieldsChanged(baseline, {
      ...baseline,
      reviewText: "Updated review"
    })).toBe(true);
  });
});
