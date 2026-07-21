import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { GoogleController } from "./google/google.controller.js";
import { GoogleService } from "./google/google.service.js";
import { HealthController } from "./health.controller.js";
import { NotificationQueueService } from "./notifications/notification-queue.service.js";
import { NotificationsController } from "./notifications/notifications.controller.js";
import { NotificationsService } from "./notifications/notifications.service.js";
import { PrismaService } from "./prisma.service.js";
import { ReviewsController } from "./reviews/reviews.controller.js";
import { ReviewsService } from "./reviews/reviews.service.js";
import { CryptoService } from "./security/crypto.service.js";
import { SemanticQueueService } from "./semantic/semantic-queue.service.js";
import { SettingsController } from "./settings.controller.js";
import { CodexRuntimeService } from "./settings/codex-runtime.service.js";
import { SettingsService } from "./settings/settings.service.js";
import { TwilioController } from "./twilio/twilio.controller.js";
import { TwilioService } from "./twilio/twilio.service.js";
import { ApiAuditInterceptor } from "./integrations/api-audit.interceptor.js";
import { ApiClientService } from "./integrations/api-client.service.js";
import { ApiIdempotencyService } from "./integrations/api-idempotency.service.js";
import { ApiKeyGuard } from "./integrations/api-key.guard.js";
import { ApiOperationsService } from "./integrations/api-operations.service.js";
import { ApiRateLimitService } from "./integrations/api-rate-limit.service.js";
import { ApiScopeGuard } from "./integrations/api-scope.guard.js";
import { ExternalCommandQueueService } from "./integrations/external-command-queue.service.js";
import { ExternalDataService } from "./integrations/external-data.service.js";
import { ExternalLocationsController } from "./integrations/external-locations.controller.js";
import { ExternalNotificationsController } from "./integrations/external-notifications.controller.js";
import { ExternalOpenApiController } from "./integrations/external-openapi.controller.js";
import { ExternalOperationsController } from "./integrations/external-operations.controller.js";
import { ExternalReviewsController } from "./integrations/external-reviews.controller.js";
import { ExternalSettingsController } from "./integrations/external-settings.controller.js";
import { ExternalSystemController } from "./integrations/external-system.controller.js";
import { IntegrationCredentialsController } from "./integrations/integration-credentials.controller.js";
import { WebhookService } from "./integrations/webhook.service.js";

@Module({
  controllers: [
    AuthController,
    GoogleController,
    HealthController,
    NotificationsController,
    ReviewsController,
    SettingsController,
    TwilioController,
    ExternalLocationsController,
    ExternalNotificationsController,
    ExternalOpenApiController,
    ExternalOperationsController,
    ExternalReviewsController,
    ExternalSettingsController,
    ExternalSystemController,
    IntegrationCredentialsController
  ],
  providers: [
    AuthService,
    CodexRuntimeService,
    CryptoService,
    GoogleService,
    NotificationQueueService,
    NotificationsService,
    PrismaService,
    ReviewsService,
    SemanticQueueService,
    SettingsService,
    TwilioService,
    ApiAuditInterceptor,
    ApiClientService,
    ApiIdempotencyService,
    ApiKeyGuard,
    ApiOperationsService,
    ApiRateLimitService,
    ApiScopeGuard,
    ExternalCommandQueueService,
    ExternalDataService,
    WebhookService
  ]
})
export class AppModule {}
