import {
  ApiClientCreateBodySchema,
  ExternalDraftEditBodySchema,
  ExternalPublishBodySchema,
  ExternalReviewListQuerySchema,
  ExternalLocationPatchBodySchema,
  WebhookEnvelopeSchema,
  WebhookEndpointCreateBodySchema,
  WebhookEndpointUpdateBodySchema
} from "@review-pilot/shared";
import { describe, expect, it } from "vitest";

describe("external API contracts", () => {
  it("accepts HTTP(S) syntax while server policy authorizes actual HTTP destinations", () => {
    const input = { apiClientId: "client", events: ["review.created"], ownerPassword: "synthetic" };
    for (const url of ["https://example.com/events", "http://receiver:8080/events"]) {
      expect(WebhookEndpointCreateBodySchema.parse({ ...input, url }).url).toBe(url);
      expect(WebhookEndpointUpdateBodySchema.parse({ url })).toEqual({ url });
    }
    for (const url of ["file:///tmp/events", "ftp://example.com/events", "invalid"]) {
      expect(WebhookEndpointCreateBodySchema.safeParse({ ...input, url }).success).toBe(false);
    }
    expect(WebhookEndpointUpdateBodySchema.parse({ active: false })).toEqual({ active: false });
  });
  it("applies bounded pagination defaults", () => {
    expect(ExternalReviewListQuerySchema.parse({})).toMatchObject({ limit: 50, status: "unhandled" });
    expect(() => ExternalReviewListQuerySchema.parse({ limit: 201 })).toThrow();
    expect(() => ExternalReviewListQuerySchema.parse({ unknown: "field" })).toThrow();
  });

  it("requires optimistic draft versions", () => {
    expect(ExternalDraftEditBodySchema.parse({ body: "Edited response", expectedVersion: 2 })).toEqual({ body: "Edited response", expectedVersion: 2 });
    expect(() => ExternalDraftEditBodySchema.parse({ body: "Edited response" })).toThrow();
  });

  it("keeps live confirmation explicit", () => {
    expect(ExternalPublishBodySchema.parse({ body: "Thanks", mode: "live" }).confirmLive).toBe(false);
  });

  it("defaults new clients to no location access", () => {
    const parsed = ApiClientCreateBodySchema.parse({
      name: "Internal system",
      environment: "test",
      scopes: ["reviews:read"],
      ownerPassword: "secret"
    });
    expect(parsed.allLocations).toBe(false);
    expect(parsed.locationIds).toEqual([]);
  });

  it("preserves sparse patches and string-key webhook payloads under Zod 4", () => {
    expect(ExternalLocationPatchBodySchema.parse({ enabled: false })).toEqual({ enabled: false });
    expect(() => ExternalLocationPatchBodySchema.parse({})).toThrow();
    const envelope = {
      eventId: "event-1", eventType: "review.updated", occurredAt: "2026-10-23T00:00:00Z",
      resourceType: "review", resourceId: "review-1", resourceVersion: "2",
      data: { nested: { values: [1, null, true] }, "custom-key": "value" }
    };
    expect(WebhookEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(() => WebhookEnvelopeSchema.parse({ ...envelope, data: [] })).toThrow();
    expect(ExternalReviewListQuerySchema.parse({ limit: "12", rating: "5" })).toMatchObject({ limit: 12, rating: 5 });
  });

  it("rejects oversized invalid collections without generating an issue for every element", () => {
    const result = ApiClientCreateBodySchema.safeParse({
      name: "Internal system", environment: "test", scopes: ["reviews:read"],
      ownerPassword: "synthetic-test-only", locationIds: Array(10_000).fill(null)
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeLessThan(10);
      expect(result.error.issues.some((issue) => issue.code === "too_big")).toBe(true);
    }
  });
});
