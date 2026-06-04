import { Inject, Injectable } from "@nestjs/common";
import { CryptoService } from "../security/crypto.service.js";
import { PrismaService } from "../prisma.service.js";

@Injectable()
export class SettingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService
  ) {}

  async getPublicBaseUrl(): Promise<string> {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: "publicBaseUrl" } });
    if (typeof setting?.value !== "string") {
      throw new Error("Public base URL is not configured");
    }
    return setting.value.replace(/\/$/, "");
  }

  async getTwilioSettings(): Promise<{ accountSid: string; authToken: string; fromNumber: string; notifyToNumber: string | null }> {
    const config = await this.prisma.twilioConfig.findFirst();
    if (!config) {
      throw new Error("Twilio is not configured");
    }

    const secret = await this.prisma.secretValue.findUnique({ where: { id: config.authTokenSecretId } });
    if (!secret) {
      throw new Error("Twilio auth token is missing");
    }

    return {
      accountSid: config.accountSid,
      authToken: this.crypto.decryptSecret(secret.ciphertext),
      fromNumber: config.fromNumber,
      notifyToNumber: config.notifyToNumber
    };
  }
}
