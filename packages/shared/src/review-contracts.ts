import { z } from "zod";

export const ReviewSeveritySchema = z.enum(["green", "yellow", "red"]);
export const ReviewPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const ReviewStatusSchema = z.enum([
  "new",
  "analysis_pending",
  "draft_ready",
  "regeneration_pending",
  "publishing",
  "published",
  "manual_handled",
  "deferred",
  "failed"
]);

export const AnalyzeReviewInputSchema = z.object({
  businessName: z.string().min(1),
  authorName: z.string().default("Customer"),
  rating: z.number().int().min(1).max(5),
  reviewText: z.string().default(""),
  reviewCreatedAt: z.string().datetime().optional(),
  historicalReplies: z.array(z.object({
    rating: z.number().int().min(1).max(5),
    reviewText: z.string(),
    reply: z.string()
  })).max(3).default([])
});

export const AnalyzeReviewOutputSchema = z.object({
  severity: ReviewSeveritySchema,
  priority: ReviewPrioritySchema,
  issues: z.array(z.string()).max(5),
  positives: z.array(z.string()).max(5),
  keywords: z.array(z.string()).max(8),
  draftReply: z.string().min(20).max(1200),
  publishRisk: z.object({
    requiresHumanReview: z.boolean(),
    reasons: z.array(z.string()).max(5)
  }),
  reasoning: z.string().max(800)
});

export const RegenerateReplyInputSchema = z.object({
  review: AnalyzeReviewInputSchema,
  currentDraft: z.string().min(1),
  ownerInstruction: z.string().min(1).max(1000)
});

export const ReviewListQuerySchema = z.object({
  status: z.enum(["unhandled", "all"]).default("unhandled"),
  locationId: z.string().optional(),
  severity: ReviewSeveritySchema.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional()
});

export const RegenerateReviewBodySchema = z.object({
  instruction: z.string().min(1).max(1000)
});

export const PublishReplyBodySchema = z.object({
  body: z.string().min(1).max(4096)
});

export type AnalyzeReviewInput = z.infer<typeof AnalyzeReviewInputSchema>;
export type AnalyzeReviewOutput = z.infer<typeof AnalyzeReviewOutputSchema>;
export type RegenerateReplyInput = z.infer<typeof RegenerateReplyInputSchema>;
