import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { notificationEligibilityReason } from "@review-pilot/shared";
import { PrismaService } from "../prisma.service.js";
import { NotificationQueueService } from "./notification-queue.service.js";

type NotificationCounts = {
  all: number;
  pending: number;
  sent: number;
  failed: number;
  canceled: number;
  skipped: number;
} & Record<string, number>;

const reviewSyncStatusKey = "reviewSyncStatus";
const missingPhoneReason = "Add a notification phone number for this location, then rerun this task.";

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationQueueService) private readonly queue: NotificationQueueService
  ) {}

  async listTasks(query: { status?: string } = {}) {
    const [reviews, groupedCounts] = await Promise.all([
      this.prisma.review.findMany({
        where: {
          ...(query.status ? { notificationStatus: query.status } : { notificationStatus: { not: "none" } })
        },
        include: {
          businessLocation: true,
          analysis: true
        },
        orderBy: [
          { notificationStatus: "asc" },
          { notifyAt: "asc" },
          { updatedAt: "desc" }
        ],
        take: 150
      }),
      this.prisma.review.groupBy({
        by: ["notificationStatus"],
        where: { notificationStatus: { not: "none" } },
        _count: { _all: true }
      })
    ]);

    const counts = groupedCounts.reduce<NotificationCounts>((acc, item) => {
      acc[item.notificationStatus] = item._count._all;
      acc.all += item._count._all;
      return acc;
    }, { all: 0, pending: 0, sent: 0, failed: 0, canceled: 0, skipped: 0 });

    return {
      tasks: reviews.map((review) => {
        const statusDisabledReason = notificationEligibilityReason(review.status);
        const phoneMissing = !review.businessLocation.notificationPhoneNumber;
        const sendDisabledReason = statusDisabledReason ?? (phoneMissing ? missingPhoneReason : null);
        return {
          reviewId: review.id,
          business: review.businessLocation.businessName,
          author: review.authorName ?? "Customer",
          rating: review.rating,
          reviewStatus: review.status,
          notificationStatus: review.notificationStatus,
          notifyAt: review.notifyAt?.toISOString() ?? null,
          notificationSentAt: review.notificationSentAt?.toISOString() ?? null,
          notificationAttempts: review.notificationAttempts,
          notificationLastError: review.notificationLastError,
          severity: review.analysis?.severity ?? null,
          sendAvailable: sendDisabledReason === null,
          sendDisabledReason,
          rerunAvailable: statusDisabledReason === null && review.notificationStatus !== "pending",
          rerunDisabledReason: statusDisabledReason
        };
      }),
      counts
    };
  }

  async sendDueNotifications(source = "manual") {
    return this.queue.enqueueScanDue(source);
  }

  async getReviewSyncStatus() {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: reviewSyncStatusKey } });
    if (!setting?.value || typeof setting.value !== "object" || Array.isArray(setting.value)) {
      return {
        enabled: process.env.REVIEW_SYNC_SCHEDULER_ENABLED !== "false",
        enabledAt: null,
        intervalMinutes: 60,
        lastStartedAt: null,
        lastFinishedAt: null,
        nextRunAt: null,
        syncWindowStartAt: null,
        syncWindowEndAt: null,
        status: process.env.REVIEW_SYNC_SCHEDULER_ENABLED === "false" ? "disabled" : "idle",
        locationsScanned: 0,
        reviewsSeen: 0,
        created: 0,
        updated: 0,
        error: null
      };
    }
    return setting.value;
  }

  async sendNow(reviewId: string) {
    const review = await this.assertSendable(reviewId);
    if (!review.businessLocation.notificationPhoneNumber) {
      return this.skipForMissingPhone(reviewId, "send_now");
    }
    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        notificationStatus: "pending",
        notifyAt: new Date(),
        notified: false,
        notificationLastError: null
      }
    });
    return this.queue.enqueueSend({ reviewId, source: "send_now" });
  }

  async cancel(reviewId: string) {
    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        notificationStatus: "canceled",
        notifyAt: null,
        notificationLastError: null,
        actions: { create: { type: "twilio_notification_canceled", metadata: { source: "owner" } } }
      },
      include: { businessLocation: true, analysis: true }
    });
    return {
      ok: true,
      reviewId: review.id,
      notificationStatus: review.notificationStatus
    };
  }

  async rerun(reviewId: string) {
    const existing = await this.assertSendable(reviewId);
    if (!existing.businessLocation.notificationPhoneNumber) {
      return this.skipForMissingPhone(reviewId, "rerun");
    }
    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        notificationStatus: "pending",
        notifyAt: new Date(),
        notified: false,
        notificationLastError: null,
        actions: { create: { type: "twilio_notification_rerun", metadata: { source: "owner" } } }
      }
    });
    const job = await this.queue.enqueueSend({ reviewId, source: "rerun" });
    return {
      ...job,
      reviewId: review.id,
      notificationStatus: review.notificationStatus,
      notifyAt: review.notifyAt?.toISOString() ?? null
    };
  }

  private async assertSendable(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        status: true,
        businessLocation: {
          select: { notificationPhoneNumber: true }
        }
      }
    });
    if (!review) {
      throw new NotFoundException("Review not found");
    }
    const reason = notificationEligibilityReason(review.status);
    if (reason) {
      throw new ConflictException(reason);
    }
    return review;
  }

  private async skipForMissingPhone(reviewId: string, source: string) {
    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        notificationStatus: "skipped",
        notifyAt: null,
        notified: false,
        notificationLastError: null,
        actions: {
          create: {
            type: "twilio_notification_skipped",
            metadata: { source, reason: "location_notification_phone_missing" }
          }
        }
      }
    });
    return {
      ok: true,
      skipped: true,
      reviewId: review.id,
      notificationStatus: review.notificationStatus,
      notifyAt: null,
      message: missingPhoneReason
    };
  }
}
