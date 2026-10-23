import { afterEach, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { SettingsService } from "../settings/settings.service.js";
import { TwilioService } from "./twilio.service.js";
import type { CryptoService } from "../security/crypto.service.js";
import type { PrismaService } from "../prisma.service.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([
  { config: null, message: "Twilio is not configured. SMS notifications are optional." },
  { config: { authTokenSecretId: "missing-secret" }, message: "Twilio auth token is missing. Save Twilio credentials before validating." }
])("returns an actionable 400 before contacting Twilio: $message", async ({ config, message }) => {
  vi.stubEnv("REVIEW_PILOT_TRIAL_MODE", "false");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const prisma = {
    twilioConfig: { findFirst: async () => config },
    secretValue: { findUnique: async () => null }
  } as unknown as PrismaService;
  const crypto = {} as CryptoService;
  const service = new TwilioService(new SettingsService(prisma, crypto), crypto, prisma);
  const error = await service.validateCredentials().catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as BadRequestException).getResponse()).toMatchObject({ statusCode: 400, message });
  expect(fetch).not.toHaveBeenCalled();
});
