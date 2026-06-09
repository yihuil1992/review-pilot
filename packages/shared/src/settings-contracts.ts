import { z } from "zod";

export const PublicUrlSettingsSchema = z.object({
  publicBaseUrl: z.string().url()
});

export const CodexRuntimeSettingsSchema = z.object({
  model: z.string().min(1).default("gpt-5.4")
});

export const PublishModeSettingsSchema = z.object({
  publishTestMode: z.boolean()
});

export const GoogleOAuthSettingsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1)
});

export const TwilioSettingsSchema = z.object({
  accountSid: z.string().min(1),
  authToken: z.string().optional().or(z.literal("")),
  fromNumber: z.string().min(1)
});

export const TwilioTestSmsSchema = z.object({
  toNumber: z.string().min(1),
  reviewId: z.string().optional()
});
