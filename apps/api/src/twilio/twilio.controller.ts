import { Body, Controller, Inject, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { OwnerAuthGuard } from "../auth/owner-auth.guard.js";
import { SettingsService } from "../settings/settings.service.js";
import { parseBody } from "../validation.js";
import { TwilioService } from "./twilio.service.js";

const sendTestSchema = z.object({
  toNumber: z.string().min(7),
  reviewId: z.string().optional()
});

@Controller("twilio")
export class TwilioController {
  constructor(
    @Inject(TwilioService) private readonly twilio: TwilioService,
    @Inject(SettingsService) private readonly settings: SettingsService
  ) {}

  @Post("test-credentials")
  @UseGuards(OwnerAuthGuard)
  validateCredentials() {
    return this.twilio.validateCredentials();
  }

  @Post("send-test")
  @UseGuards(OwnerAuthGuard)
  sendTest(@Body() body: unknown) {
    const input = parseBody(sendTestSchema, body);
    return this.twilio.sendTestSms(input);
  }

  @Post("webhook")
  async inboundWebhook(@Req() request: Request, @Body() body: Record<string, string>) {
    const config = await this.settings.getTwilioSettings();
    const url = `${await this.settings.getPublicBaseUrl()}${request.originalUrl}`;
    const valid = this.twilio.validateWebhookSignature(
      url,
      body,
      request.header("X-Twilio-Signature"),
      config.authToken
    );
    if (!valid) {
      throw new UnauthorizedException("Invalid Twilio signature");
    }

    return { ok: true };
  }
}
