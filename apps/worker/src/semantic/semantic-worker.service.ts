import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, ReviewPriority, ReviewSeverity } from "@review-pilot/db";
import {
  semanticJobNames,
  semanticQueueName,
  type AnalyzeReviewOutput,
  type SemanticJobData
} from "@review-pilot/shared";
import { Job, Worker } from "bullmq";
import { PrismaService } from "../prisma.service.js";
import { CodexSubscriptionEngine } from "./codex-subscription.engine.js";

@Injectable()
export class SemanticWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly connection = redisConnection();
  private worker: Worker<SemanticJobData> | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CodexSubscriptionEngine) private readonly semantic: CodexSubscriptionEngine
  ) {}

  onModuleInit() {
    this.worker = new Worker(
      semanticQueueName,
      (job) => this.process(job),
      {
        connection: this.connection,
        concurrency: Number(process.env.SEMANTIC_WORKER_CONCURRENCY ?? 1)
      }
    );
    console.log("semantic BullMQ worker ready");
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async process(job: Job<SemanticJobData>) {
    const { reviewId, jobRunId, instruction, currentDraftBody } = job.data;
    await this.prisma.jobRun.update({
      where: { id: jobRunId },
      data: { status: "running", startedAt: new Date() }
    });

    try {
      const output =
        job.name === semanticJobNames.generateReply
          ? await this.generate(reviewId)
          : job.name === semanticJobNames.regenerateReply
            ? await this.regenerate(reviewId, instruction, currentDraftBody)
            : null;

      if (!output) {
        throw new Error(`Unsupported semantic job: ${job.name}`);
      }

      const draft = await this.persistSemanticOutput(reviewId, output, instruction);
      await this.prisma.jobRun.update({
        where: { id: jobRunId },
        data: { status: "succeeded", finishedAt: new Date() }
      });
      return { reviewId, draftId: draft.id };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "Semantic job failed";
      await this.prisma.jobRun.update({
        where: { id: jobRunId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorCode: "semantic_failed",
          errorMessage: message
        }
      });
      await this.prisma.review.update({
        where: { id: reviewId },
        data: { status: "failed" }
      });
      throw new Error(message);
    }
  }

  private async generate(reviewId: string) {
    const review = await this.loadReviewForSemantic(reviewId);
    return this.semantic.analyzeReview({
      businessName: review.businessLocation.businessName,
      authorName: review.authorName ?? "Customer",
      rating: review.rating,
      reviewText: review.reviewText ?? "",
      reviewCreatedAt: review.reviewCreatedAt?.toISOString(),
      historicalReplies: await this.getHistoricalReplies(review.businessLocationId)
    });
  }

  private async regenerate(reviewId: string, instruction: string | undefined, currentDraftBody: string | undefined) {
    if (!instruction) {
      throw new Error("Regeneration instruction is missing");
    }
    const review = await this.loadReviewForSemantic(reviewId);
    const currentDraft = currentDraftBody?.trim() || review.drafts[0]?.body;
    if (!currentDraft) {
      throw new Error("No current draft is available to regenerate");
    }

    return this.semantic.regenerateReply({
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
    });
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

  private async persistSemanticOutput(reviewId: string, output: AnalyzeReviewOutput, instruction?: string) {
    const version = (await this.prisma.replyDraft.count({ where: { reviewId } })) + 1;
    const draft = await this.prisma.replyDraft.create({
      data: {
        reviewId,
        aiBody: output.draftReply,
        body: output.draftReply,
        instruction,
        version,
        userEdited: false
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
        actions: {
          create: {
            type: instruction ? "regenerated" : "draft_generated",
            metadata: { source: "codex-subscription-worker" }
          }
        }
      }
    });

    return draft;
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
