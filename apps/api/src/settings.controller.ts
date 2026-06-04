import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import {
  CodexRuntimeSettingsSchema,
  PublishModeSettingsSchema,
  PublicUrlSettingsSchema,
  TwilioSettingsSchema
} from "@review-pilot/shared";
import { z } from "zod";
import { OwnerAuthGuard } from "./auth/owner-auth.guard.js";
import { CodexRuntimeService } from "./settings/codex-runtime.service.js";
import { SettingsService } from "./settings/settings.service.js";
import { parseBody } from "./validation.js";

const googleOAuthSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().optional().or(z.literal(""))
});

@Controller("settings")
export class SettingsController {
  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(CodexRuntimeService) private readonly codexRuntime: CodexRuntimeService
  ) {}

  @Get("bootstrap")
  bootstrapState() {
    return this.settings.getBootstrap();
  }

  @Post("public-url")
  @UseGuards(OwnerAuthGuard)
  savePublicUrl(@Body() body: unknown) {
    const input = parseBody(PublicUrlSettingsSchema, body);
    return this.settings.savePublicUrl(input.publicBaseUrl);
  }

  @Post("codex")
  @UseGuards(OwnerAuthGuard)
  saveCodex(@Body() body: unknown) {
    const input = parseBody(CodexRuntimeSettingsSchema, body);
    return this.settings.saveCodex({
      model: input.model ?? "gpt-5.4"
    });
  }

  @Post("publish-mode")
  @UseGuards(OwnerAuthGuard)
  savePublishMode(@Body() body: unknown) {
    const input = parseBody(PublishModeSettingsSchema, body);
    return this.settings.savePublishMode(input.publishTestMode);
  }

  @Post("codex/test")
  @UseGuards(OwnerAuthGuard)
  testCodex() {
    return this.codexRuntime.testRuntime();
  }

  @Post("codex/login/start")
  @UseGuards(OwnerAuthGuard)
  startCodexLogin() {
    return this.codexRuntime.startDeviceLogin();
  }

  @Get("codex/login/status")
  @UseGuards(OwnerAuthGuard)
  codexLoginStatus() {
    return this.codexRuntime.getDeviceLoginStatus();
  }

  @Post("google-oauth")
  @UseGuards(OwnerAuthGuard)
  saveGoogleOAuth(@Body() body: unknown) {
    const input = parseBody(googleOAuthSchema, body);
    return this.settings.saveGoogleOAuth(input);
  }

  @Post("twilio")
  @UseGuards(OwnerAuthGuard)
  saveTwilio(@Body() body: unknown) {
    const input = parseBody(TwilioSettingsSchema, body);
    return this.settings.saveTwilio(input);
  }
}
