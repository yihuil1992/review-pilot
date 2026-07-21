import type { WebhookEventType } from "./external-api-contracts.js";

export const webhookQueueName = "review-pilot-webhooks";

export const webhookJobNames = {
  deliver: "deliver"
} as const;

export type WebhookDeliveryJobData = {
  deliveryId: string;
};

export type WebhookEventInput = {
  eventType: WebhookEventType;
  resourceType: string;
  resourceId: string;
  resourceVersion: string;
  data: Record<string, unknown>;
};
