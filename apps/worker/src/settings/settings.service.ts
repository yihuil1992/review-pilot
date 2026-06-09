import { Inject, Injectable } from "@nestjs/common";
import { basename, dirname, join, resolve } from "node:path";
import { CryptoService } from "../security/crypto.service.js";
import { PrismaService } from "../prisma.service.js";

type CodexSettings = {
  codexHome: string;
  codexWorkdir: string;
  model: string;
  transcriptRetentionDays: number;
};

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

  async getTwilioSettings(): Promise<{ accountSid: string; authToken: string; fromNumber: string }> {
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
      fromNumber: config.fromNumber
    };
  }

  async getGoogleOAuthSettings(): Promise<{ clientId: string; clientSecret: string }> {
    const [config, secret] = await Promise.all([
      this.prisma.appSetting.findUnique({ where: { key: "googleOAuth" } }),
      this.prisma.secretValue.findUnique({ where: { scope_key: { scope: "google", key: "clientSecret" } } })
    ]);
    if (!config?.value || typeof config.value !== "object" || Array.isArray(config.value) || !secret) {
      throw new Error("Google OAuth is not configured");
    }

    const value = config.value as { clientId?: string };
    if (!value.clientId) {
      throw new Error("Google OAuth is not configured");
    }

    return {
      clientId: value.clientId,
      clientSecret: this.crypto.decryptSecret(secret.ciphertext)
    };
  }

  async getCodexSettings(): Promise<CodexSettings> {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: "codex" } });
    const defaults = defaultCodexSettings();
    if (!setting?.value || typeof setting.value !== "object" || Array.isArray(setting.value)) {
      return defaults;
    }

    const value = setting.value as Partial<CodexSettings>;
    return {
      codexHome: value.codexHome ?? defaults.codexHome,
      codexWorkdir: value.codexWorkdir ?? defaults.codexWorkdir,
      model: value.model ?? defaults.model,
      transcriptRetentionDays: value.transcriptRetentionDays ?? defaults.transcriptRetentionDays
    };
  }
}

export function defaultCodexSettings() {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const railwayStateRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  return {
    codexHome: process.env.CODEX_HOME ?? (railwayStateRoot ? join(railwayStateRoot, "codex-home") : home ? join(home, ".codex") : ".codex"),
    codexWorkdir: process.env.CODEX_WORKDIR ?? (railwayStateRoot ? join(railwayStateRoot, "codex-workdir") : join(projectRoot(), ".agent-session", "semantic-runtime")),
    model: process.env.CODEX_MODEL ?? "gpt-5.4",
    transcriptRetentionDays: Number(process.env.SEMANTIC_TRANSCRIPT_RETENTION_DAYS ?? 7)
  };
}

function projectRoot(): string {
  const cwd = process.cwd();
  if (basename(cwd) === "worker" && basename(dirname(cwd)) === "apps") {
    return resolve(cwd, "..", "..");
  }
  return cwd;
}
