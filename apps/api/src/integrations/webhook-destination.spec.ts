import { assertWebhookDestinationAllowed } from "@review-pilot/shared";
import { afterEach, expect, it, vi } from "vitest";
import { WebhookService } from "./webhook.service.js";

vi.mock("bullmq", () => ({ Queue: class {} }));
afterEach(() => vi.unstubAllEnvs());
const destination = "http://receiver:8080/events";

it("denies HTTP by default and permits only the configured exact URL", () => {
  expect(() => assertWebhookDestinationAllowed("https://example.com/events")).not.toThrow();
  expect(() => assertWebhookDestinationAllowed(destination)).toThrow(/explicitly allowed/);
  const allowed = JSON.stringify([destination]);
  expect(() => assertWebhookDestinationAllowed(destination, allowed)).not.toThrow();
  for (const value of ["http://other:8080/events", `${destination}/`, `${destination}?x=1`, `${destination}#fragment`, "http://user@receiver:8080/events", "http://receiver:8080/x/../events", "http://receiver:8081/events"]) {
    expect(() => assertWebhookDestinationAllowed(value, allowed)).toThrow();
  }
  for (const config of ["*", '"*"', "{}", "[1]"]) expect(() => assertWebhookDestinationAllowed(destination, config)).toThrow();
});

it("rejects unauthorized destinations before create/update writes", async () => {
  vi.stubEnv("WEBHOOK_ALLOWED_HTTP_URLS", "[]");
  const prisma = { apiClient: { findUnique: vi.fn() }, webhookEndpoint: { update: vi.fn() } };
  const service = new WebhookService(prisma as never, {} as never);
  await expect(service.createEndpoint({ apiClientId: "client", url: destination, events: ["review.created"] })).rejects.toThrow(/explicitly allowed/);
  await expect(service.updateEndpoint("endpoint", { url: destination })).rejects.toThrow(/explicitly allowed/);
  expect(prisma.apiClient.findUnique).not.toHaveBeenCalled();
  expect(prisma.webhookEndpoint.update).not.toHaveBeenCalled();
});
