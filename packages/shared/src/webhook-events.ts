import type { ApiScope, WebhookEventType } from "./external-api-contracts.js";

const webhookEventScopes: Record<WebhookEventType, ApiScope> = {
  "review.created": "reviews:read",
  "review.updated": "reviews:read",
  "draft.ready": "reviews:read",
  "publish.succeeded": "reviews:read",
  "publish.failed": "reviews:read",
  "notification.updated": "notifications:read",
  "sync.completed": "sync:run"
};

export function requiredWebhookEventScope(eventType: WebhookEventType): ApiScope {
  return webhookEventScopes[eventType];
}

export type NotificationWebhookState = {
  notificationStatus: string;
  notifyAt: Date | null;
  notificationSentAt: Date | null;
  notificationAttempts: number;
  notificationLastError: string | null;
};

export function notificationUpdatedWebhookData(state: NotificationWebhookState) {
  return {
    notificationStatus: state.notificationStatus,
    notifyAt: state.notifyAt?.toISOString() ?? null,
    notificationSentAt: state.notificationSentAt?.toISOString() ?? null,
    notificationAttempts: state.notificationAttempts,
    notificationLastError: state.notificationLastError
  };
}
