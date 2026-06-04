import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  notificationJobNames,
  notificationQueueName,
  type NotificationSendJobData
} from "@review-pilot/shared";
import { Prisma, ReviewStatus } from "@review-pilot/db";
import { Job, Queue, Worker } from "bullmq";
import { PrismaService } from "../prisma.service.js";
import { TwilioService } from "../twilio/twilio.service.js";

const notifiableStatuses: ReviewStatus[] = ["draft_ready", "failed", "deferred"];

@Injectable()
export class NotificationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly connection = redisConnection();
  private readonly queue = new Queue(notificationQueueName, {
    connection: this.connection
  });
  private worker: Worker | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TwilioService) private readonly twilio: TwilioService
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
    if (job.name === notificationJobNames.scanDue) {
      return this.scanDue(String(job.data?.source ?? "worker"));
    }
    if (job.name === notificationJobNames.send) {
      const data = job.data as NotificationSendJobData;
      return this.sendOne(job, data);
    }
    throw new Error(`Unsupported notification job: ${job.name}`);
  }

  private async scanDue(source: string) {
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
      await this.queue.add(notificationJobNames.send, { reviewId: review.id, source }, {
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
      select: { id: true, notificationStatus: true, status: true }
    });
    if (!review || review.notificationStatus !== "pending" || !notifiableStatuses.includes(review.status)) {
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
