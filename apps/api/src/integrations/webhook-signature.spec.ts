import { signWebhookPayload, verifyWebhookSignature } from "@review-pilot/shared";
import { describe, expect, it } from "vitest";

describe("webhook signatures", () => {
  it("verifies the exact raw body inside the replay window", () => {
    const secret = "whsec_test";
    const timestamp = "1721577600";
    const rawBody = '{"eventId":"event-1"}';
    const signatureHeader = `v1=${signWebhookPayload(secret, timestamp, rawBody)}`;
    expect(verifyWebhookSignature({ secret, timestamp, rawBody, signatureHeader, nowSeconds: 1721577601 })).toBe(true);
    expect(verifyWebhookSignature({ secret, timestamp, rawBody: `${rawBody} `, signatureHeader, nowSeconds: 1721577601 })).toBe(false);
  });

  it("rejects stale deliveries and malformed headers", () => {
    const timestamp = "1721577600";
    const rawBody = "{}";
    const signatureHeader = `v1=${signWebhookPayload("secret", timestamp, rawBody)}`;
    expect(verifyWebhookSignature({ secret: "secret", timestamp, rawBody, signatureHeader, nowSeconds: 1721578000, toleranceSeconds: 300 })).toBe(false);
    expect(verifyWebhookSignature({ secret: "secret", timestamp, rawBody, signatureHeader: "bad", nowSeconds: 1721577600 })).toBe(false);
  });
});
