export const semanticQueueName = "review-pilot.semantic";

export const semanticJobNames = {
  generateReply: "semantic.generateReply",
  regenerateReply: "semantic.regenerateReply"
} as const;

export type SemanticJobData = {
  reviewId: string;
  jobRunId: string;
  instruction?: string;
  currentDraftBody?: string;
};

export const codexRuntimeQueueName = "review-pilot.codex-runtime";

export const codexRuntimeJobNames = {
  test: "codex.runtime.test",
  startLogin: "codex.runtime.startLogin",
  loginStatus: "codex.runtime.loginStatus"
} as const;
