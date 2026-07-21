import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  ApiClientCreateBodySchema,
  ApiClientRotateBodySchema,
  OwnerConfirmedBodySchema,
  WebhookEndpointCreateBodySchema,
  WebhookEndpointUpdateBodySchema
} from "@review-pilot/shared";
import { AuthService } from "../auth/auth.service.js";
import { OwnerAuthGuard } from "../auth/owner-auth.guard.js";
import { parseBody } from "../validation.js";
import { ApiClientService, currentEnvironment } from "./api-client.service.js";
import { WebhookService } from "./webhook.service.js";

@Controller("integrations")
@UseGuards(OwnerAuthGuard)
export class IntegrationCredentialsController {
  constructor(
    @Inject(ApiClientService) private readonly clients: ApiClientService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(WebhookService) private readonly webhooks: WebhookService
  ) {}

  @Get("clients")
  listClients() {
    return this.clients.listClients();
  }

  @Get("environment")
  environment() {
    return { environment: currentEnvironment() };
  }

  @Post("clients")
  async createClient(@Body() body: unknown) {
    const input = parseBody(ApiClientCreateBodySchema, body);
    await this.auth.verifyOwnerPassword(input.ownerPassword);
    const { ownerPassword: _, ...clientInput } = input;
    return this.clients.createClient({ ...clientInput, allLocations: clientInput.allLocations ?? false, locationIds: clientInput.locationIds ?? [] });
  }

  @Post("clients/:clientId/rotate")
  async rotateClient(@Param("clientId") clientId: string, @Body() body: unknown) {
    const input = parseBody(ApiClientRotateBodySchema, body);
    await this.auth.verifyOwnerPassword(input.ownerPassword);
    return this.clients.rotateClient(clientId, input.expiresAt);
  }

  @Post("clients/:clientId/revoke")
  async revokeClient(@Param("clientId") clientId: string, @Body() body: unknown) {
    const input = parseBody(OwnerConfirmedBodySchema, body);
    await this.auth.verifyOwnerPassword(input.ownerPassword);
    return this.clients.revokeClient(clientId);
  }

  @Post("credentials/:credentialId/revoke")
  async revokeCredential(@Param("credentialId") credentialId: string, @Body() body: unknown) {
    const input = parseBody(OwnerConfirmedBodySchema, body);
    await this.auth.verifyOwnerPassword(input.ownerPassword);
    return this.clients.revokeCredential(credentialId);
  }

  @Get("webhooks")
  listWebhooks() {
    return this.webhooks.listEndpoints();
  }

  @Post("webhooks")
  async createWebhook(@Body() body: unknown) {
    const input = parseBody(WebhookEndpointCreateBodySchema, body);
    await this.auth.verifyOwnerPassword(input.ownerPassword);
    return this.webhooks.createEndpoint(input);
  }

  @Patch("webhooks/:webhookId")
  updateWebhook(@Param("webhookId") webhookId: string, @Body() body: unknown) {
    return this.webhooks.updateEndpoint(webhookId, parseBody(WebhookEndpointUpdateBodySchema, body));
  }

  @Post("webhooks/:webhookId/rotate-secret")
  async rotateWebhook(@Param("webhookId") webhookId: string, @Body() body: unknown) {
    const input = parseBody(OwnerConfirmedBodySchema, body);
    await this.auth.verifyOwnerPassword(input.ownerPassword);
    return this.webhooks.rotateSecret(webhookId);
  }

  @Post("webhook-deliveries/:deliveryId/replay")
  replayDelivery(@Param("deliveryId") deliveryId: string) {
    return this.webhooks.replayDelivery(deliveryId);
  }
}
