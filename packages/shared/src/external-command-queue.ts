export const externalCommandQueueName = "review-pilot-external-commands";

export const externalCommandJobNames = {
  syncLocation: "sync-location"
} as const;

export type ExternalCommandJobData = {
  operationId: string;
  apiClientId: string;
  locationId: string;
};
