export const notificationQueueName = "review-pilot.notifications";

export const notificationJobNames = {
  scanDue: "notification.scanDue",
  send: "notification.send"
} as const;

export type NotificationSendJobData = {
  reviewId: string;
  source: string;
};
