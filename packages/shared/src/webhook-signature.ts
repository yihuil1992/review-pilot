import { createHmac, timingSafeEqual } from "node:crypto";

export function signWebhookPayload(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");
}

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string;
  rawBody: string;
  signatureHeader: string | undefined;
  toleranceSeconds?: number;
  nowSeconds?: number;
}) {
  const signature = input.signatureHeader?.startsWith("v1=") ? input.signatureHeader.slice(3) : "";
  const timestamp = Number(input.timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!signature || !Number.isFinite(timestamp) || Math.abs(now - timestamp) > (input.toleranceSeconds ?? 300)) return false;
  const expected = signWebhookPayload(input.secret, input.timestamp, input.rawBody);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
