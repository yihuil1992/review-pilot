import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { verifyWebhookSignature, webhookJobNames } from "@review-pilot/shared";
import { WebhookProcessor } from "./webhook.processor.js";

afterEach(() => vi.unstubAllEnvs());

async function scenario(redirect: boolean, allowed = true) {
  vi.stubEnv("REVIEW_PILOT_TRIAL_MODE", "false");
  const requests: { path: string; body: string; headers: IncomingHttpHeaders }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({ path: req.url ?? "", body: Buffer.concat(chunks).toString(), headers: req.headers });
    if (redirect && req.url === "/webhook/review-pilot") res.writeHead(307, { Location: "/unexpected" });
    else res.writeHead(200);
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const payload = { eventId: "event-1", eventType: "review.created", resourceType: "review", resourceId: "review-1" };
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhook/review-pilot`;
  vi.stubEnv("WEBHOOK_ALLOWED_HTTP_URLS", JSON.stringify(allowed ? [url] : []));
  const prisma = { webhookDelivery: {
    findUnique: vi.fn().mockResolvedValue({ id: "delivery-1", payload, endpoint: { active: true, url, secretEncrypted: "encrypted" } }),
    update: vi.fn().mockResolvedValue({})
  } };
  const crypto = { decryptSecret: vi.fn().mockReturnValue("synthetic-signing-secret") };
  const processor = new WebhookProcessor(prisma as never, crypto as never);
  type Job = { name: string; data: { deliveryId: string }; opts: { attempts: number }; attemptsMade: number };
  const run = () => (processor as unknown as { process(job: Job): Promise<unknown> }).process({ name: webhookJobNames.deliver, data: { deliveryId: "delivery-1" }, opts: { attempts: 6 }, attemptsMade: 0 });
  try {
    if (redirect || !allowed) await expect(run()).rejects.toThrow();
    else await expect(run()).resolves.toEqual({ delivered: true, status: 200 });
    if (!allowed) {
      expect(requests).toHaveLength(0);
      expect(prisma.webhookDelivery.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "pending", nextAttemptAt: expect.any(Date) }) }));
      return;
    }
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.path).toBe("/webhook/review-pilot");
    expect(request.body).toBe(JSON.stringify(payload));
    expect(request.headers["x-review-pilot-delivery"]).toBe("delivery-1");
    expect(verifyWebhookSignature({ secret: "synthetic-signing-secret", rawBody: request.body, timestamp: String(request.headers["x-review-pilot-timestamp"]), signatureHeader: String(request.headers["x-review-pilot-signature"]) })).toBe(true);
    expect(prisma.webhookDelivery.update).toHaveBeenNthCalledWith(1, { where: { id: "delivery-1" }, data: { status: "delivering", attempts: { increment: 1 }, nextAttemptAt: null } });
    expect(prisma.webhookDelivery.update).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: "delivery-1" }, data: expect.objectContaining(redirect ? { status: "pending", nextAttemptAt: expect.any(Date) } : { status: "delivered", lastError: null }) }));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

it("delivers signed HTTP payloads without changing the event or delivery identity", () => scenario(false));
it("does not follow a redirect and retains the existing retry state", () => scenario(true));
it("refuses an existing HTTP endpoint after its allowlist entry is removed", () => scenario(false, false));
