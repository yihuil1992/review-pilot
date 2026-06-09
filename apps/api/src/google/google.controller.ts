import { Body, Controller, Get, Inject, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { OwnerAuthGuard } from "../auth/owner-auth.guard.js";
import { parseBody } from "../validation.js";
import { GoogleService } from "./google.service.js";

const connectUrlSchema = z.object({
  redirectUri: z.string().url().optional(),
  returnTo: z.string().url().optional()
});

const locationEnabledSchema = z.object({
  enabled: z.boolean()
});

const locationNotificationPhoneSchema = z.object({
  notificationPhoneNumber: z.string().optional().or(z.literal(""))
});

@Controller("google")
export class GoogleController {
  constructor(@Inject(GoogleService) private readonly google: GoogleService) {}

  @Post("oauth/connect-url")
  @UseGuards(OwnerAuthGuard)
  createConnectUrl(@Body() body: unknown) {
    const input = parseBody(connectUrlSchema, body ?? {});
    return this.google.createConnectUrl(input);
  }

  @Get("oauth/callback")
  async callback(@Query("code") code: string | undefined, @Query("state") state: string | undefined, @Res() response: Response) {
    if (!code || !state) {
      throw new Error("Missing Google OAuth code or state");
    }

    const result = await this.google.completeOAuth(code, state);
    response.redirect(302, result.returnTo ?? "/settings?google=connected");
  }

  @Get("accounts")
  @UseGuards(OwnerAuthGuard)
  listAccounts() {
    return this.google.listAccounts();
  }

  @Post("accounts/:accountId/discover-locations")
  @UseGuards(OwnerAuthGuard)
  discoverLocations(@Param("accountId") accountId: string) {
    return this.google.discoverLocations(accountId);
  }

  @Get("locations")
  @UseGuards(OwnerAuthGuard)
  listLocations() {
    return this.google.listLocations();
  }

  @Post("locations/:locationId/enabled")
  @UseGuards(OwnerAuthGuard)
  setLocationEnabled(@Param("locationId") locationId: string, @Body() body: unknown) {
    const input = parseBody(locationEnabledSchema, body);
    return this.google.setLocationEnabled(locationId, input.enabled);
  }

  @Post("locations/:locationId/notification-phone")
  @UseGuards(OwnerAuthGuard)
  setLocationNotificationPhone(@Param("locationId") locationId: string, @Body() body: unknown) {
    const input = parseBody(locationNotificationPhoneSchema, body);
    return this.google.setLocationNotificationPhone(locationId, input.notificationPhoneNumber ?? "");
  }

  @Post("locations/:locationId/sync-reviews")
  @UseGuards(OwnerAuthGuard)
  syncReviews(@Param("locationId") locationId: string) {
    return this.google.syncReviews(locationId);
  }
}
