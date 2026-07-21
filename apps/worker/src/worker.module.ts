import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { GoogleReviewSyncService } from "./google/google-review-sync.service.js";
import { NotificationWorkerService } from "./notifications/notification-worker.service.js";
import { PrismaService } from "./prisma.service.js";
import { CryptoService } from "./security/crypto.service.js";
import { CodexRuntimeWorkerService } from "./semantic/codex-runtime-worker.service.js";
import { CodexSubscriptionEngine } from "./semantic/codex-subscription.engine.js";
import { SemanticWorkerService } from "./semantic/semantic-worker.service.js";
import { SettingsService } from "./settings/settings.service.js";
import { TwilioService } from "./twilio/twilio.service.js";
import { ApiOperationTrackerService } from "./integrations/api-operation-tracker.service.js";
import { ExternalCommandProcessor } from "./integrations/external-command.processor.js";
import { ApiMaintenanceProcessor } from "./maintenance/api-maintenance.processor.js";
import { WebhookEmitterService } from "./webhooks/webhook-emitter.service.js";
import { WebhookProcessor } from "./webhooks/webhook.processor.js";

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    CodexSubscriptionEngine,
    CodexRuntimeWorkerService,
    CryptoService,
    GoogleReviewSyncService,
    NotificationWorkerService,
    PrismaService,
    SemanticWorkerService,
    SettingsService,
    TwilioService,
    ApiOperationTrackerService,
    ExternalCommandProcessor,
    ApiMaintenanceProcessor,
    WebhookEmitterService,
    WebhookProcessor
  ],
  exports: [CodexSubscriptionEngine]
})
export class WorkerModule {}
