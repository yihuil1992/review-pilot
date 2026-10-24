import { afterEach, expect, it, vi } from "vitest";
import { TwilioService } from "./twilio.service.js";
import type { SettingsService } from "../settings/settings.service.js";
import type { CryptoService } from "../security/crypto.service.js";
import type { PrismaService } from "../prisma.service.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("blocks a real SMS path before fetch even when credentials are configured", async () => {
  vi.stubEnv("REVIEW_PILOT_TRIAL_MODE", "true");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const settings = {
    getTwilioSettings: async () => ({ accountSid: "test", authToken: "test", fromNumber: "+15005550006" }),
    getPublicBaseUrl: async () => "https://reviews.example.com"
  } as unknown as SettingsService;
  const service = new TwilioService(settings, {} as CryptoService, {} as PrismaService);
  await expect(service.sendTestSms({ toNumber: "+15005550006" })).rejects.toThrow("disabled in this trial");
  expect(fetch).not.toHaveBeenCalled();
});
