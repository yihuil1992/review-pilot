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
import { CodexSemanticService } from "./semantic/codex-semantic.service.js";
import { SettingsController } from "./settings.controller.js";
import { CodexRuntimeService } from "./settings/codex-runtime.service.js";
import { SettingsService } from "./settings/settings.service.js";
import { TwilioController } from "./twilio/twilio.controller.js";
import { TwilioService } from "./twilio/twilio.service.js";

@Module({
  controllers: [
    AuthController,
    GoogleController,
    HealthController,
    NotificationsController,
    ReviewsController,
    SettingsController,
    TwilioController
  ],
  providers: [
    AuthService,
    CodexRuntimeService,
    CodexSemanticService,
    CryptoService,
    GoogleService,
    NotificationQueueService,
    NotificationsService,
    PrismaService,
    ReviewsService,
    SettingsService,
    TwilioService
  ]
})
export class AppModule {}
