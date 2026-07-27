import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  canSendReviewNotification,
  notificationJobNames,
  notificationQueueName,
  notificationUpdatedWebhookData,
  notifiableReviewStatuses,
  type NotificationScanJobData,
  type NotificationSendJobData
} from "@review-pilot/shared";
import { Prisma, ReviewStatus } from "@review-pilot/db";
import { Job, Queue, Worker } from "bullmq";
import { PrismaService } from "../prisma.service.js";
import { TwilioService } from "../twilio/twilio.service.js";
import { ApiOperationTrackerService } from "../integrations/api-operation-tracker.service.js";
import { WebhookEmitterService } from "../webhooks/webhook-emitter.service.js";

const notifiableStatuses = [...notifiableReviewStatuses] as ReviewStatus[];

@Injectable()
export class NotificationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly connection = redisConnection();
  private readonly queue = new Queue(notificationQueueName, {
    connection: this.connection
  });
  private worker: Worker | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TwilioService) private readonly twilio: TwilioService,
    @Inject(ApiOperationTrackerService) private readonly operations: ApiOperationTrackerService,
    @Inject(WebhookEmitterService) private readonly webhooks: WebhookEmitterService
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      notificationQueueName,
      (job) => this.process(job),
      {
        connection: this.connection,
        concurrency: Number(process.env.NOTIFICATION_WORKER_CONCURRENCY ?? 2)
      }
    );
    console.log("notification BullMQ worker ready");
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async enqueueDueScan() {
    if (process.env.NOTIFICATION_SCHEDULER_ENABLED === "false") {
      return;
    }
    await this.queue.add(
      notificationJobNames.scanDue,
      { source: "schedule" },
      {
        attempts: 1,
        removeOnComplete: { age: 24 * 60 * 60, count: 100 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 500 }
      }
    );
  }

  private async process(job: Job) {
    const queueJobId = String(job.id);
    await this.operations.startByQueueJobId(queueJobId);
    try {
      let result: Record<string, unknown>;
      if (job.name === notificationJobNames.scanDue) {
        result = await this.scanDue(job.data as NotificationScanJobData);
      } else if (job.name === notificationJobNames.send) {
        const data = job.data as NotificationSendJobData;
        result = await this.sendOne(job, data);
        await this.emitNotificationUpdated(data.reviewId);
      } else {
        throw new Error(`Unsupported notification job: ${job.name}`);
      }
      await this.operations.succeedByQueueJobId(queueJobId, result);
      return result;
    } catch (error) {
      if (job.name === notificationJobNames.send) {
        await this.emitNotificationUpdated((job.data as NotificationSendJobData).reviewId);
      }
      await this.operations.failByQueueJobId(queueJobId, error);
      throw error;
    }
  }

  private async emitNotificationUpdated(reviewId: string) {
    try {
      const review = await this.prisma.review.findUnique({
        where: { id: reviewId },
        select: {
          businessLocationId: true,
          notificationStatus: true,
          notifyAt: true,
          notificationSentAt: true,
          notificationAttempts: true,
          notificationLastError: true,
          updatedAt: true
        }
      });
      if (!review) return;
      await this.webhooks.emitForLocation(review.businessLocationId, {
        eventType: "notification.updated",
        resourceType: "review",
        resourceId: reviewId,
        resourceVersion: review.updatedAt.toISOString(),
        data: notificationUpdatedWebhookData(review)
      });
    } catch (error) {
      console.error("Failed to enqueue notification.updated webhook", error);
    }
  }

  private async scanDue(input: NotificationScanJobData) {
    const source = String(input?.source ?? "worker");
    const dueReviews = await this.prisma.review.findMany({
      where: {
        notificationStatus: "pending",
        notifyAt: { lte: new Date() },
        status: { in: notifiableStatuses }
      },
      include: { analysis: true },
      orderBy: [
        { analysis: { priority: "desc" } },
        { notifyAt: "asc" }
      ],
      take: 10
    });

    for (const review of dueReviews) {
      await this.queue.add(notificationJobNames.send, { reviewId: review.id, source, apiClientId: input.apiClientId }, {
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 500 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 }
      });
    }

    return {
      enqueued: dueReviews.length,
      reviewIds: dueReviews.map((review) => review.id)
    };
  }

  private async sendOne(job: Job, data: NotificationSendJobData) {
    const { reviewId, source } = data;
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        notificationStatus: true,
        status: true,
        businessLocation: {
          select: { notificationPhoneNumber: true }
        }
      }
    });
    if (!review || review.notificationStatus !== "pending" || !canSendReviewNotification(review.status)) {
      return {
        ok: true,
        skipped: true,
        reviewId
      };
    }
    if (!review.businessLocation.notificationPhoneNumber) {
      await this.prisma.review.update({
        where: { id: reviewId },
        data: {
          notificationStatus: "skipped",
          notifyAt: null,
          notificationLastError: null,
          actions: {
            create: {
              type: "twilio_notification_skipped",
              metadata: { source, reason: "location_notification_phone_missing" } satisfies Prisma.InputJsonObject
            }
          }
        }
      });
      return {
        ok: true,
        skipped: true,
        reviewId
      };
    }

    try {
      return await this.twilio.sendReviewNotification(reviewId);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Twilio notification failed";
      const maxAttempts = typeof job.opts.attempts === "number" ? job.opts.attempts : 1;
      const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
      await this.prisma.review.update({
        where: { id: reviewId },
        data: {
          notificationStatus: isFinalAttempt ? "failed" : "pending",
          notificationAttempts: { increment: 1 },
          notificationLastError: message,
          actions: {
            create: {
              type: "twilio_notification_failed",
              metadata: { source, message } satisfies Prisma.InputJsonObject
            }
          }
        }
      });
      throw new Error(message);
    }
  }
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number(url.pathname.slice(1) || 0),
    maxRetriesPerRequest: null
  };
}
