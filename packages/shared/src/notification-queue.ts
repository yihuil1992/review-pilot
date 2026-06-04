export const notificationQueueName = "review-pilot.notifications";

export const notificationJobNames = {
  scanDue: "notification.scanDue",
  send: "notification.send"
} as const;

export const notifiableReviewStatuses = ["draft_ready", "failed", "deferred"] as const;

export function canSendReviewNotification(status: string): boolean {
  return (notifiableReviewStatuses as readonly string[]).includes(status);
}

export function notificationEligibilityReason(status: string): string | null {
  if (canSendReviewNotification(status)) {
    return null;
  }
  if (status === "published") {
    return "This reply has already been published, so no owner notification will be sent.";
  }
  if (status === "manual_handled") {
    return "This review has already been marked handled.";
  }
  if (status === "new" || status === "analysis_pending" || status === "regeneration_pending") {
    return "Finish generating the owner draft before sending a notification.";
  }
  return "This review is not in a notification-ready state.";
}

export type NotificationSendJobData = {
  reviewId: string;
  source: string;
};
