import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma, ReviewPriority, ReviewSeverity, ReviewStatus } from "@review-pilot/db";
import type { AnalyzeReviewOutput } from "@review-pilot/shared";
import { PrismaService } from "../prisma.service.js";
import { CodexSemanticService } from "../semantic/codex-semantic.service.js";
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

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CodexSemanticService) private readonly semantic: CodexSemanticService,
    @Inject(GoogleService) private readonly google: GoogleService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(TwilioService) private readonly twilio: TwilioService
  ) {}

  async list(query: { status?: "unhandled" | "all"; locationId?: string; severity?: string; rating?: number }) {
    const reviews = await this.prisma.review.findMany({
      where: {
        ...(query.status === "all" ? {} : { status: { in: unhandledStatuses } }),
        ...(query.locationId ? { businessLocationId: query.locationId } : {}),
        ...(query.rating ? { rating: query.rating } : {}),
        ...(query.severity ? { analysis: { severity: query.severity as ReviewSeverity } } : {})
      },
      include: reviewIncludes(),
      orderBy: [{ reviewCreatedAt: "desc" }, { createdAt: "desc" }],
      take: 100
    });

    return reviews.map(toReviewDto);
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

  async generateBySignedLink(reviewId: string, token: string | undefined) {
    this.assertSignedReviewLink(reviewId, token);
    return this.generate(reviewId);
  }

  async regenerateBySignedLink(reviewId: string, token: string | undefined, instruction: string) {
    this.assertSignedReviewLink(reviewId, token);
    return this.regenerate(reviewId, instruction);
  }

  async publishBySignedLink(reviewId: string, token: string | undefined, body: string) {
    this.assertSignedReviewLink(reviewId, token);
    return this.publish(reviewId, body);
  }

  async markManualHandledBySignedLink(reviewId: string, token: string | undefined) {
    this.assertSignedReviewLink(reviewId, token);
    return this.markManualHandled(reviewId);
  }

  async generate(reviewId: string) {
    const review = await this.loadReviewForSemantic(reviewId);
    await this.prisma.review.update({ where: { id: reviewId }, data: { status: "analysis_pending" } });
    return this.runSemanticJob(reviewId, "semantic.generateReply", async () =>
      this.semantic.analyzeReview({
        businessName: review.businessLocation.businessName,
        authorName: review.authorName ?? "Customer",
        rating: review.rating,
        reviewText: review.reviewText ?? "",
        reviewCreatedAt: review.reviewCreatedAt?.toISOString(),
        historicalReplies: await this.getHistoricalReplies(review.businessLocationId)
      })
    );
  }

  async regenerate(reviewId: string, instruction: string) {
    const review = await this.loadReviewForSemantic(reviewId);
    const currentDraft = review.drafts[0]?.body;
    if (!currentDraft) {
      throw new Error("No current draft is available to regenerate");
    }

    await this.prisma.review.update({ where: { id: reviewId }, data: { status: "regeneration_pending" } });
    return this.runSemanticJob(reviewId, "semantic.regenerateReply", async () =>
      this.semantic.regenerateReply({
        review: {
          businessName: review.businessLocation.businessName,
          authorName: review.authorName ?? "Customer",
          rating: review.rating,
          reviewText: review.reviewText ?? "",
          reviewCreatedAt: review.reviewCreatedAt?.toISOString(),
          historicalReplies: await this.getHistoricalReplies(review.businessLocationId)
        },
        currentDraft,
        ownerInstruction: instruction
      })
    , instruction);
  }

  async publish(reviewId: string, body: string) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) {
      throw new Error("Review not found");
    }
    if (review.status === "published" && review.publishedReply === body) {
      return this.get(reviewId);
    }
    const publishTestMode = await this.settings.isPublishTestMode();
    if (!publishTestMode) {
      await this.assertPublishAllowed(review.businessLocationId);
    }

    await this.prisma.review.update({ where: { id: reviewId }, data: { status: "publishing" } });
    if (!publishTestMode) {
      await this.google.publishReply(reviewId, body);
    }
    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status: "published",
        publishedReply: body,
        replyPublishedAt: publishTestMode ? null : new Date(),
        actions: { create: { type: "published", metadata: { source: "owner", testMode: publishTestMode } } }
      }
    });
    return { ...(await this.get(reviewId)), publishTestMode };
  }

  async sendDueNotifications() {
    return this.notifications.sendDueNotifications("legacy_reviews_endpoint");
  }

  async markManualHandled(reviewId: string) {
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

  private async runSemanticJob(
    reviewId: string,
    type: string,
    run: () => Promise<AnalyzeReviewOutput>,
    instruction?: string
  ) {
    const job = await this.prisma.jobRun.create({
      data: {
        reviewId,
        type,
        status: "running",
        provider: "codex-subscription",
        model: process.env.CODEX_MODEL ?? null,
        promptVersion: "review-pilot-v1",
        outputSchemaVersion: "review-analysis-v1"
      }
    });

    try {
      const output = await run();
      const draft = await this.persistSemanticOutput(reviewId, output, instruction);
      await this.prisma.jobRun.update({ where: { id: job.id }, data: { status: "succeeded" } });
      return { review: await this.get(reviewId), draft };
    } catch (error) {
      await this.prisma.jobRun.update({
        where: { id: job.id },
        data: {
          status: "failed",
          errorCode: "semantic_failed",
          errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "Semantic job failed"
        }
      });
      await this.prisma.review.update({ where: { id: reviewId }, data: { status: "failed" } });
      throw error;
    }
  }

  private async persistSemanticOutput(reviewId: string, output: AnalyzeReviewOutput, instruction?: string) {
    const version = (await this.prisma.replyDraft.count({ where: { reviewId } })) + 1;
    const draft = await this.prisma.replyDraft.create({
      data: {
        reviewId,
        body: output.draftReply,
        instruction,
        version
      }
    });

    await this.prisma.reviewAnalysis.upsert({
      where: { reviewId },
      create: {
        reviewId,
        severity: output.severity as ReviewSeverity,
        priority: output.priority as ReviewPriority,
        issues: output.issues,
        positives: output.positives,
        keywords: output.keywords,
        publishRisk: output.publishRisk as Prisma.InputJsonValue,
        reasoning: output.reasoning
      },
      update: {
        severity: output.severity as ReviewSeverity,
        priority: output.priority as ReviewPriority,
        issues: output.issues,
        positives: output.positives,
        keywords: output.keywords,
        publishRisk: output.publishRisk as Prisma.InputJsonValue,
        reasoning: output.reasoning
      }
    });

    await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status: "draft_ready",
        latestDraftId: draft.id,
        notifyAt: calculateNotifyAt(output.severity),
        notified: false,
        notificationSentAt: null,
        notificationStatus: "pending",
        notificationLastError: null,
        actions: { create: { type: instruction ? "regenerated" : "draft_generated", metadata: { source: "codex-subscription" } } }
      }
    });

    return draft;
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
    drafts: { orderBy: { version: "desc" as const }, take: 1 }
  };
}

function toReviewDto(review: Prisma.ReviewGetPayload<{ include: ReturnType<typeof reviewIncludes> }>) {
  const draft = review.drafts[0] ?? null;
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
    draft: draft ? { id: draft.id, body: draft.body, version: draft.version, instruction: draft.instruction } : null,
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
