import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { SettingsService } from "./settings.service.js";
import { CryptoService } from "../security/crypto.service.js";
import type { PrismaService } from "../prisma.service.js";

describe("Google OAuth credential replacement", () => {
  const crypto = new CryptoService();
  const prisma = {
    ownerUser: { findFirst: vi.fn() },
    secretValue: { upsert: vi.fn(), findUnique: vi.fn() },
    appSetting: { upsert: vi.fn() }
  };
  const service = new SettingsService(prisma as unknown as PrismaService, crypto);

  beforeEach(async () => {
    vi.resetAllMocks();
    prisma.ownerUser.findFirst.mockResolvedValue({ passwordHash: await crypto.hashPassword("owner-password") });
    prisma.secretValue.findUnique.mockResolvedValue({ id: "existing-secret" });
  });

  it("rejects an autofilled login password before changing either OAuth credential", async () => {
    const result = service.saveGoogleOAuth({ clientId: "replacement-client", clientSecret: " owner-password " });
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.secretValue.upsert).not.toHaveBeenCalled();
    expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  it("accepts and encrypts a distinct OAuth secret without imposing a provider format", async () => {
    await service.saveGoogleOAuth({ clientId: "existing-client", clientSecret: " valid-client-secret " });
    const saved = prisma.secretValue.upsert.mock.calls[0]?.[0];
    expect(crypto.decryptSecret(saved.update.ciphertext)).toBe("valid-client-secret");
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { value: { clientId: "existing-client" } }
    }));
  });

  it("preserves the existing secret when the replacement field is empty", async () => {
    await service.saveGoogleOAuth({ clientId: "existing-client", clientSecret: " " });
    expect(prisma.ownerUser.findFirst).not.toHaveBeenCalled();
    expect(prisma.secretValue.upsert).not.toHaveBeenCalled();
    expect(prisma.appSetting.upsert).toHaveBeenCalled();
  });
});
