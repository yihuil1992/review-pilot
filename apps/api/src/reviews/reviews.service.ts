import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma, ReviewSeverity, ReviewStatus } from "@review-pilot/db";
import { assessReplyPublishRisk } from "@review-pilot/shared";
import { PrismaService } from "../prisma.service.js";
import { SemanticQueueService } from "../semantic/semantic-queue.service.js";
import { GoogleService } from "../google/google.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { TwilioService } from "../twilio/twilio.service.js";

const unhandledStatuses: ReviewStatus[] = [
  "new",
  "analysis_pending",
  "draft_ready",
  "regeneration_pending",
  "publishing",
  "deferred",
  "failed"
];

const publishLimitPerDay = 10;
const publishIntervalMs = 15 * 60 * 1000;
const completedStatuses: ReviewStatus[] = ["published", "manual_handled"];

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SemanticQueueService) private readonly semanticQueue: SemanticQueueService,
    @Inject(GoogleService) private readonly google: GoogleService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(TwilioService) private readonly twilio: TwilioService
  ) {}

  async list(query: { status?: "unhandled" | "all"; locationId?: string; severity?: string; rating?: number }) {
    const limit = 100;
    const where = reviewListWhere(query);
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: reviewIncludes(),
        orderBy: [{ reviewCreatedAt: "desc" }, { createdAt: "desc" }],
        take: limit
      }),
      this.prisma.review.count({ where })
    ]);

    return { items: reviews.map(toReviewDto), total, limit };
  }

  async get(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: reviewIncludes()
    });
    if (!review) {
      throw new Error("Review not found");
    }
    return toReviewDto(review);
  }

  async getBySignedLink(reviewId: string, token: string | undefined) {
    this.assertSignedReviewLink(reviewId, token);
    return { ...(await this.get(reviewId)), publishTestMode: await this.settings.isPublishTestMode() };
  }

  async generateBySignedLink(reviewId: string, token: string | undefined, currentDraftBody?: string) {
    this.assertSignedReviewLink(reviewId, token);
    return this.generate(reviewId, currentDraftBody);
  }

  async regenerateBySignedLink(reviewId: string, token: string | undefined, instruction: string, currentDraftBody?: string) {
    this.assertSignedReviewLink(reviewId, token);
    return this.regenerate(reviewId, instruction, currentDraftBody);
  }

  async publishBySignedLink(reviewId: string, token: string | undefined, body: string) {
    this.assertSignedReviewLink(reviewId, token);
    return this.publish(reviewId, body);
  }

  async markManualHandledBySignedLink(reviewId: string, token: string | undefined) {
    this.assertSignedReviewLink(reviewId, token);
    return this.markManualHandled(reviewId);
  }

  async generate(reviewId: string, currentDraftBody?: string) {
    const review = await this.loadReviewForSemantic(reviewId);
    this.assertReviewActionable(review.status);
    await this.saveLatestDraftEdit(reviewId, currentDraftBody);
    const codex = await this.settings.getCodexSettings();
    const [jobRun] = await Promise.all([
      this.createSemanticJobRun(reviewId, "semantic.generateReply", codex.model),
      this.prisma.review.update({ where: { id: reviewId }, data: { status: "analysis_pending" } })
    ]);
    const job = await this.semanticQueue.enqueueGenerate({ reviewId, jobRunId: jobRun.id });
    return { queued: true, job, review: await this.get(reviewId) };
  }

  async regenerate(reviewId: string, instruction: string, currentDraftBody?: string) {
    const review = await this.loadReviewForSemantic(reviewId);
    this.assertReviewActionable(review.status);
    const savedDraft = await this.saveLatestDraftEdit(reviewId, currentDraftBody);
    const currentDraft = savedDraft?.body ?? currentDraftBody ?? review.drafts[0]?.body;
    if (!currentDraft) {
      throw new Error("No current draft is available to regenerate");
    }

    const codex = await this.settings.getCodexSettings();
    const [jobRun] = await Promise.all([
      this.createSemanticJobRun(reviewId, "semantic.regenerateReply", codex.model),
      this.prisma.review.update({ where: { id: reviewId }, data: { status: "regeneration_pending" } })
    ]);
    const job = await this.semanticQueue.enqueueRegenerate({ reviewId, jobRunId: jobRun.id, instruction, currentDraftBody: currentDraft });
    return { queued: true, job, review: await this.get(reviewId) };
  }

  async publish(reviewId: string, body: string) {
    const finalBody = body.trim();
    if (!finalBody) {
      throw new BadRequestException("Reply body is required");
    }
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { drafts: { orderBy: { version: "desc" }, take: 1 } }
    });
    if (!review) {
      throw new Error("Review not found");
    }
    this.assertReviewActionable(review.status);
    if (review.status === "published" && review.publishedReply === finalBody) {
      return this.get(reviewId);
    }
    const draft = await this.saveLatestDraftEdit(reviewId, finalBody);
    const manualRisk = assessReplyPublishRisk({
      rating: review.rating,
      reviewText: review.reviewText ?? "",
      replyBody: finalBody,
      aiBody: draft?.aiBody ?? review.drafts[0]?.aiBody ?? null
    });
    const publishTestMode = await this.settings.isPublishTestMode();
    if (!publishTestMode) {
      await this.assertPublishAllowed(review.businessLocationId);
    }

    await this.prisma.review.update({ where: { id: reviewId }, data: { status: "publishing" } });
    if (!publishTestMode) {
      await this.google.publishReply(reviewId, finalBody);
    }
    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status: "published",
        publishedReply: finalBody,
        replyPublishedAt: publishTestMode ? null : new Date(),
        actions: {
          create: {
            type: "published",
            metadata: {
              source: "owner",
              testMode: publishTestMode,
              userEditedDraft: Boolean(draft?.userEdited),
              manualRisk
            }
          }
        }
      }
    });
    return { ...(await this.get(reviewId)), publishTestMode, manualRisk };
  }

  async sendDueNotifications() {
    return this.notifications.sendDueNotifications("legacy_reviews_endpoint");
  }

  async markManualHandled(reviewId: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new Error("Review not found");
    }
    this.assertReviewActionable(review.status);
    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status: "manual_handled",
        actions: { create: { type: "manual_handled", metadata: { source: "owner" } } }
      }
    });
    return this.get(reviewId);
  }

  private async loadReviewForSemantic(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        businessLocation: true,
        drafts: { orderBy: { version: "desc" }, take: 1 }
      }
    });
    if (!review) {
      throw new Error("Review not found");
    }
    return review;
  }

  private async createSemanticJobRun(reviewId: string, type: string, model: string) {
    return this.prisma.jobRun.create({
      data: {
        reviewId,
        type,
        status: "queued",
        provider: "codex-subscription",
        model,
        promptVersion: "review-pilot-v1",
        outputSchemaVersion: "review-analysis-v1"
      }
    });
  }

  private async saveLatestDraftEdit(reviewId: string, body: string | undefined) {
    if (body === undefined) {
      return null;
    }
    const finalBody = body.trim();
    if (!finalBody) {
      throw new BadRequestException("Draft body is required");
    }
    const draft = await this.prisma.replyDraft.findFirst({
      where: { reviewId },
      orderBy: { version: "desc" }
    });
    if (!draft) {
      return null;
    }

    const userEdited = normalizeDraftBody(finalBody) !== normalizeDraftBody(draft.aiBody);
    if (draft.body === finalBody && draft.userEdited === userEdited) {
      return draft;
    }

    return this.prisma.replyDraft.update({
      where: { id: draft.id },
      data: {
        body: finalBody,
        userEdited,
        editedAt: userEdited ? new Date() : null
      }
    });
  }

  private async assertPublishAllowed(businessLocationId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [todayCount, latestPublished] = await Promise.all([
      this.prisma.review.count({
        where: {
          businessLocationId,
          status: "published",
          replyPublishedAt: { gte: startOfDay }
        }
      }),
      this.prisma.review.findFirst({
        where: {
          businessLocationId,
          status: "published",
          replyPublishedAt: { not: null }
        },
        orderBy: { replyPublishedAt: "desc" },
        select: { replyPublishedAt: true }
      })
    ]);

    if (todayCount >= publishLimitPerDay) {
      throw new ConflictException("Daily Google reply publish limit reached for this location");
    }

    if (latestPublished?.replyPublishedAt && Date.now() - latestPublished.replyPublishedAt.getTime() < publishIntervalMs) {
      const remainingMinutes = Math.ceil((publishIntervalMs - (Date.now() - latestPublished.replyPublishedAt.getTime())) / 60_000);
      throw new ConflictException(`Please wait ${remainingMinutes} more minutes before publishing another reply for this location`);
    }
  }

  private async getHistoricalReplies(businessLocationId: string) {
    const reviews = await this.prisma.review.findMany({
      where: {
        businessLocationId,
        status: "published",
        publishedReply: { not: null },
        reviewText: { not: null }
      },
      orderBy: { replyPublishedAt: "desc" },
      take: 3,
      select: {
        rating: true,
        reviewText: true,
        publishedReply: true
      }
    });

    return reviews
      .filter((review): review is { rating: number; reviewText: string; publishedReply: string } =>
        Boolean(review.reviewText && review.publishedReply)
      )
      .map((review) => ({
        rating: review.rating,
        reviewText: review.reviewText,
        reply: review.publishedReply
      }));
  }

  private assertSignedReviewLink(reviewId: string, token: string | undefined) {
    if (!this.twilio.verifyReviewLink(token, reviewId)) {
      throw new UnauthorizedException("Signed review link is invalid or expired");
    }
  }

  private assertReviewActionable(status: ReviewStatus) {
    if (completedStatuses.includes(status)) {
      throw new ConflictException("This review has already been handled");
    }
  }
}

function calculateNotifyAt(severity: string): Date {
  const delayHours =
    severity === "red" ? randomBetween(1, 6) :
    severity === "yellow" ? randomBetween(6, 12) :
    randomBetween(12, 24);
  return new Date(Date.now() + delayHours * 60 * 60 * 1000);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function reviewIncludes() {
  return {
    businessLocation: {
      include: { googleAccount: { select: { email: true } } }
    },
    analysis: true,
    drafts: { orderBy: { version: "desc" as const }, take: 1 },
    jobs: {
      where: { type: { in: ["semantic.generateReply", "semantic.regenerateReply"] } },
      orderBy: { createdAt: "desc" as const },
      take: 1
    }
  };
}

function reviewListWhere(query: { status?: "unhandled" | "all"; locationId?: string; severity?: string; rating?: number }): Prisma.ReviewWhereInput {
  return {
    ...(query.status === "all" ? {} : { status: { in: unhandledStatuses } }),
    ...(query.locationId ? { businessLocationId: query.locationId } : {}),
    ...(query.rating ? { rating: query.rating } : {}),
    ...(query.severity ? { analysis: { severity: query.severity as ReviewSeverity } } : {})
  };
}

function toReviewDto(review: Prisma.ReviewGetPayload<{ include: ReturnType<typeof reviewIncludes> }>) {
  const draft = review.drafts[0] ?? null;
  const semanticJob = review.jobs[0] ?? null;
  return {
    id: review.id,
    googleReviewId: review.googleReviewId,
    business: review.businessLocation.businessName,
    businessLocationId: review.businessLocationId,
    googleMapsUrl: buildGoogleMapsUrl(review.businessLocation.placeId, review.businessLocation.businessName),
    googleAccountEmail: review.businessLocation.googleAccount.email,
    author: review.authorName ?? "Customer",
    rating: review.rating,
    text: review.reviewText ?? "",
    reviewCreatedAt: review.reviewCreatedAt?.toISOString() ?? null,
    status: review.status,
    analysis: review.analysis
      ? {
          severity: review.analysis.severity,
          priority: review.analysis.priority,
          issues: review.analysis.issues,
          positives: review.analysis.positives,
          keywords: review.analysis.keywords,
          publishRisk: review.analysis.publishRisk,
          reasoning: review.analysis.reasoning
        }
      : null,
    draft: draft
      ? {
          id: draft.id,
          aiBody: draft.aiBody,
          body: draft.body,
          version: draft.version,
          instruction: draft.instruction,
          userEdited: draft.userEdited,
          editedAt: draft.editedAt?.toISOString() ?? null
        }
      : null,
    semanticJob: semanticJob
      ? {
          id: semanticJob.id,
          type: semanticJob.type,
          status: semanticJob.status,
          errorCode: semanticJob.errorCode,
          errorMessage: semanticJob.errorMessage,
          startedAt: semanticJob.startedAt?.toISOString() ?? null,
          finishedAt: semanticJob.finishedAt?.toISOString() ?? null
        }
      : null,
    publishedReply: review.publishedReply,
    replyPublishedAt: review.replyPublishedAt?.toISOString() ?? null
  };
}

function buildGoogleMapsUrl(placeId: string | null, businessName: string): string | null {
  if (!placeId) {
    return null;
  }
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", businessName);
  url.searchParams.set("query_place_id", placeId);
  return url.toString();
}

function normalizeDraftBody(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
