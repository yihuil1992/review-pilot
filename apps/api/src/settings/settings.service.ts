import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@review-pilot/db";
import { basename, dirname, join, resolve } from "node:path";
import { PrismaService } from "../prisma.service.js";
import { CryptoService } from "../security/crypto.service.js";

type CodexSettings = {
  codexHome: string;
  codexWorkdir: string;
  model: string;
  transcriptRetentionDays: number;
};

type CodexBootstrap = CodexSettings & {
  configured: boolean;
};

@Injectable()
export class SettingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CryptoService) private readonly crypto: CryptoService
  ) {}

  async getBootstrap() {
    const [ownerConfigured, publicUrl, codex, twilio, googleOAuth, googleSecret, publishTestMode] = await Promise.all([
      this.prisma.ownerUser.count().then((count) => count > 0),
      this.getSetting("publicBaseUrl"),
      this.getSetting("codex"),
      this.prisma.twilioConfig.findFirst(),
      this.getSetting("googleOAuth"),
      this.prisma.secretValue.findUnique({ where: { scope_key: { scope: "google", key: "clientSecret" } } }),
      this.getSetting("publishTestMode")
    ]);

    const codexSettings = parseCodexSetting(codex?.value);
    const googleOAuthSettings = parseGoogleOAuthSetting(googleOAuth?.value);
    return {
      ownerConfigured,
      publicBaseUrl: typeof publicUrl?.value === "string" ? publicUrl.value : null,
      googleCallbackUrl: typeof publicUrl?.value === "string" ? buildGoogleCallbackUrl(publicUrl.value) : null,
      publicBaseUrlConfigured: Boolean(publicUrl),
      codexConfigured: Boolean(codex),
      codex: codexSettings ?? defaultCodexSettings(),
      twilioConfigured: Boolean(twilio),
      twilio: twilio
        ? {
            accountSid: twilio.accountSid,
            authTokenConfigured: Boolean(twilio.authTokenSecretId),
            authTokenMasked: "••••••••",
            fromNumber: twilio.fromNumber
          }
        : null,
      googleConfigured: Boolean(googleSecret && googleOAuthSettings?.clientId),
      googleOAuth: googleOAuthSettings
        ? {
            clientId: googleOAuthSettings.clientId,
            clientSecretConfigured: Boolean(googleSecret),
            clientSecretMasked: googleSecret ? "••••••••" : null
          }
        : null,
      publishTestMode: typeof publishTestMode?.value === "boolean" ? publishTestMode.value : false
    };
  }

  async savePublicUrl(publicBaseUrl: string) {
    await this.setSetting("publicBaseUrl", publicBaseUrl);
    return {
      publicBaseUrl,
      googleCallbackUrl: buildGoogleCallbackUrl(publicBaseUrl)
    };
  }

  async saveCodex(settings: { codexHome?: string; codexWorkdir?: string; model: string; transcriptRetentionDays?: number }) {
    const defaults = defaultCodexSettings();
    const resolved = {
      codexHome: settings.codexHome ?? defaults.codexHome,
      codexWorkdir: settings.codexWorkdir ?? defaults.codexWorkdir,
      model: settings.model,
      transcriptRetentionDays: settings.transcriptRetentionDays ?? defaults.transcriptRetentionDays
    };
    await this.setSetting("codex", resolved);
    return {
      ...resolved,
      configured: true
    };
  }

  async savePublishMode(publishTestMode: boolean) {
    await this.setSetting("publishTestMode", publishTestMode);
    return { publishTestMode };
  }

  async isPublishTestMode(): Promise<boolean> {
    const setting = await this.getSetting("publishTestMode");
    return typeof setting?.value === "boolean" ? setting.value : false;
  }

  async saveGoogleOAuth(settings: { clientId: string; clientSecret?: string }) {
    const clientSecret = settings.clientSecret?.trim();
    if (clientSecret) {
      await this.upsertSecret("google", "clientSecret", clientSecret);
    } else {
      const existingSecret = await this.prisma.secretValue.findUnique({ where: { scope_key: { scope: "google", key: "clientSecret" } } });
      if (!existingSecret) {
        throw new Error("Google client secret is required");
      }
    }
    await this.setSetting("googleOAuth", { clientId: settings.clientId });
    return {
      clientId: settings.clientId,
      clientSecret: clientSecret ? maskSecret(clientSecret) : "••••••••",
      configured: true
    };
  }

  async saveTwilio(settings: { accountSid: string; authToken?: string; fromNumber: string }) {
    const existing = await this.prisma.twilioConfig.findFirst();
    const authToken = settings.authToken?.trim();
    let authTokenSecretId = existing?.authTokenSecretId;
    if (authToken) {
      const secret = await this.upsertSecret("twilio", "authToken", authToken);
      authTokenSecretId = secret.id;
    }
    if (!authTokenSecretId) {
      throw new Error("Twilio auth token is required");
    }
    await this.prisma.twilioConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        accountSid: settings.accountSid,
        authTokenSecretId,
        fromNumber: settings.fromNumber
      },
      update: {
        accountSid: settings.accountSid,
        authTokenSecretId,
        fromNumber: settings.fromNumber
      }
    });

    return {
      accountSid: settings.accountSid,
      authToken: authToken ? maskSecret(authToken) : "••••••••",
      fromNumber: settings.fromNumber,
      configured: true
    };
  }

  async getPublicBaseUrl(): Promise<string> {
    const setting = await this.getSetting("publicBaseUrl");
    if (typeof setting?.value !== "string") {
      throw new Error("Public base URL is not configured");
    }
    return setting.value.replace(/\/$/, "");
  }

  async getCodexSettings(): Promise<CodexSettings> {
    const setting = await this.getSetting("codex");
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

  async getGoogleOAuthSettings(): Promise<{ clientId: string; clientSecret: string }> {
    const [setting, secret] = await Promise.all([
      this.getSetting("googleOAuth"),
      this.prisma.secretValue.findUnique({ where: { scope_key: { scope: "google", key: "clientSecret" } } })
    ]);
    if (!setting?.value || typeof setting.value !== "object" || Array.isArray(setting.value) || !secret) {
      throw new Error("Google OAuth is not configured");
    }

    const value = setting.value as { clientId?: string };
    if (!value.clientId) {
      throw new Error("Google OAuth is not configured");
    }

    return {
      clientId: value.clientId,
      clientSecret: this.crypto.decryptSecret(secret.ciphertext)
    };
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

  private async setSetting(key: string, value: Prisma.InputJsonValue) {
    return this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value }
    });
  }

  private async getSetting(key: string) {
    return this.prisma.appSetting.findUnique({ where: { key } });
  }

  private async upsertSecret(scope: string, key: string, plaintext: string) {
    const ciphertext = this.crypto.encryptSecret(plaintext);
    return this.prisma.secretValue.upsert({
      where: { scope_key: { scope, key } },
      create: { scope, key, ciphertext },
      update: { ciphertext }
    });
  }
}

function maskSecret(value: string): string {
  if (value.length <= 8) {
    return "********";
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function buildGoogleCallbackUrl(publicBaseUrl: string): string {
  return `${publicBaseUrl.replace(/\/$/, "")}/api/google/oauth/callback`;
}

function parseCodexSetting(value: Prisma.JsonValue | undefined): CodexBootstrap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const settings = value as Partial<CodexSettings>;
  return {
    ...defaultCodexSettings(),
    ...settings,
    configured: Boolean(settings.codexHome && settings.codexWorkdir && settings.model)
  };
}

function parseGoogleOAuthSetting(value: Prisma.JsonValue | undefined): { clientId: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const settings = value as { clientId?: unknown };
  return typeof settings.clientId === "string" && settings.clientId ? { clientId: settings.clientId } : null;
}

function defaultCodexSettings(): CodexBootstrap {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  const railwayStateRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  return {
    codexHome: process.env.CODEX_HOME ?? (railwayStateRoot ? join(railwayStateRoot, "codex-home") : home ? join(home, ".codex") : ".codex"),
    codexWorkdir: process.env.CODEX_WORKDIR ?? (railwayStateRoot ? join(railwayStateRoot, "codex-workdir") : join(projectRoot(), ".agent-session", "semantic-runtime")),
    model: process.env.CODEX_MODEL ?? "gpt-5.4",
    transcriptRetentionDays: Number(process.env.SEMANTIC_TRANSCRIPT_RETENTION_DAYS ?? 7),
    configured: false
  };
}

function projectRoot(): string {
  const cwd = process.cwd();
  if (basename(cwd) === "api" && basename(dirname(cwd)) === "apps") {
    return resolve(cwd, "..", "..");
  }
  return cwd;
}
