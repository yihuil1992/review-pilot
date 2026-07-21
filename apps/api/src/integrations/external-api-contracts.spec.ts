import {
  ApiClientCreateBodySchema,
  ExternalDraftEditBodySchema,
  ExternalPublishBodySchema,
  ExternalReviewListQuerySchema
} from "@review-pilot/shared";
import { describe, expect, it } from "vitest";

describe("external API contracts", () => {
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
});
