type ReplyRiskInput = {
  rating: number;
  reviewText: string;
  replyBody: string;
  aiBody?: string | null;
};

type ReplyRiskResult = {
  editedAfterAiCheck: boolean;
  requiresHumanReview: boolean;
  reasons: string[];
};

const sensitivePatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(refund|chargeback|compensation|reimburse)\b/i, reason: "Final reply mentions refunds or compensation." },
  { pattern: /\b(lawsuit|legal|attorney|lawyer|sue|court)\b/i, reason: "Final reply mentions legal escalation." },
  { pattern: /\b(discriminat|racis|sexist|harass)\b/i, reason: "Final reply mentions discrimination or harassment." },
  { pattern: /\b(food poisoning|sick|illness|mold|cockroach|roach|pest|unsafe)\b/i, reason: "Final reply mentions safety, illness, or pest concerns." },
  { pattern: /\b(liar|lying|fake review|not true|never come back)\b/i, reason: "Final reply uses language that may escalate the customer exchange." }
];

export function assessReplyPublishRisk(input: ReplyRiskInput): ReplyRiskResult {
  const replyBody = input.replyBody.trim();
  const aiBody = input.aiBody?.trim() ?? "";
  const reasons = new Set<string>();
  const editedAfterAiCheck = Boolean(aiBody && normalizeReplyText(replyBody) !== normalizeReplyText(aiBody));

  if (replyBody.length < 20) {
    reasons.add("Final reply is very short for a public Google response.");
  }

  for (const item of sensitivePatterns) {
    if (item.pattern.test(replyBody)) {
      reasons.add(item.reason);
    }
  }

  if (input.rating <= 2 && !/\b(sorry|apologize|apology|thank|appreciate)\b/i.test(replyBody)) {
    reasons.add("Low-rating reply does not include an apology, thanks, or acknowledgement.");
  }

  return {
    editedAfterAiCheck,
    requiresHumanReview: reasons.size > 0,
    reasons: Array.from(reasons).slice(0, 5)
  };
}

function normalizeReplyText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
