import type {
  AnalyzeReviewInput,
  AnalyzeReviewOutput,
  RegenerateReplyInput
} from "@review-pilot/shared";

export interface SemanticEngine {
  analyzeReview(input: AnalyzeReviewInput): Promise<AnalyzeReviewOutput>;
  regenerateReply(input: RegenerateReplyInput): Promise<AnalyzeReviewOutput>;
}

