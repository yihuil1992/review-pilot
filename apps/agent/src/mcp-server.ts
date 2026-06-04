#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { clientFromEnv, fail, type AgentResult } from "./api-client.js";

const server = new McpServer({
  name: "review-pilot",
  version: "0.1.0"
});

const reviewIdSchema = {
  reviewId: z.string().min(1).describe("Review Pilot review id")
};

server.registerTool(
  "get_system_status",
  {
    title: "Get system status",
    description: "Check API health, readiness, and bootstrap configuration status.",
    inputSchema: {}
  },
  async () => toToolResult(await clientFromEnv().status())
);

server.registerTool(
  "doctor",
  {
    title: "Run doctor checks",
    description: "Return agent-friendly readiness checks for API, public URL, Google, Codex, Twilio, and publish test mode.",
    inputSchema: {}
  },
  async () => toToolResult(await clientFromEnv().doctor())
);

server.registerTool(
  "list_reviews",
  {
    title: "List reviews",
    description: "List owner-authenticated reviews, optionally filtered by status, location, severity, or rating.",
    inputSchema: {
      status: z.enum(["unhandled", "all"]).optional().describe("Review list status filter"),
      locationId: z.string().optional().describe("Business location id"),
      severity: z.enum(["green", "yellow", "red"]).optional(),
      rating: z.number().int().min(1).max(5).optional()
    }
  },
  async (input) => toToolResult(await clientFromEnv().listReviews(input))
);

server.registerTool(
  "get_review",
  {
    title: "Get review",
    description: "Fetch one review by id.",
    inputSchema: reviewIdSchema
  },
  async ({ reviewId }) => toToolResult(await clientFromEnv().getReview(reviewId))
);

server.registerTool(
  "generate_reply",
  {
    title: "Generate reply",
    description: "Generate an AI reply draft for a review. This changes Review Pilot state but does not publish externally.",
    inputSchema: reviewIdSchema
  },
  async ({ reviewId }) => toToolResult(await clientFromEnv().generateReviewDraft(reviewId))
);

server.registerTool(
  "regenerate_reply",
  {
    title: "Regenerate reply",
    description: "Regenerate an AI reply draft using an owner instruction.",
    inputSchema: {
      ...reviewIdSchema,
      instruction: z.string().min(1).max(1000).describe("Owner instruction for revising the draft")
    }
  },
  async ({ reviewId, instruction }) => toToolResult(await clientFromEnv().regenerateReviewDraft(reviewId, instruction))
);

server.registerTool(
  "publish_test_reply",
  {
    title: "Test publish reply",
    description: "Publish through Review Pilot only when publish test mode is enabled. Does not send a Google reply in test mode.",
    inputSchema: {
      ...reviewIdSchema,
      body: z.string().optional().describe("Reply body. If omitted, the current AI draft is used."),
      enableTestMode: z.boolean().default(false).describe("Set publish test mode first if the server has it disabled.")
    }
  },
  async ({ reviewId, body, enableTestMode }) => toToolResult(await clientFromEnv().publishTestReply(reviewId, body, enableTestMode))
);

server.registerTool(
  "publish_live_reply",
  {
    title: "Live publish reply",
    description: "Publish a real Google reply. Requires confirmLive=true and server publish test mode must be disabled.",
    inputSchema: {
      ...reviewIdSchema,
      body: z.string().optional().describe("Reply body. If omitted, the current AI draft is used."),
      confirmLive: z.boolean().describe("Must be true to acknowledge the external Google publish side effect.")
    }
  },
  async ({ reviewId, body, confirmLive }) => toToolResult(await clientFromEnv().publishLiveReply(reviewId, body, confirmLive))
);

server.registerTool(
  "mark_review_handled",
  {
    title: "Mark review handled",
    description: "Mark a review as manually handled in Review Pilot.",
    inputSchema: reviewIdSchema
  },
  async ({ reviewId }) => toToolResult(await clientFromEnv().markReviewHandled(reviewId))
);

server.registerTool(
  "list_notification_tasks",
  {
    title: "List notification tasks",
    description: "List Twilio notification tasks by status.",
    inputSchema: {
      status: z.enum(["pending", "sent", "failed", "canceled", "none"]).optional()
    }
  },
  async (input) => toToolResult(await clientFromEnv().listNotificationTasks(input))
);

server.registerTool(
  "get_review_sync_status",
  {
    title: "Get review sync status",
    description: "Read the latest Google review sync worker status.",
    inputSchema: {}
  },
  async () => toToolResult(await clientFromEnv().getReviewSyncStatus())
);

server.registerTool(
  "run_due_notifications",
  {
    title: "Run due notifications",
    description: "Manually enqueue due notification work.",
    inputSchema: {}
  },
  async () => toToolResult(await clientFromEnv().runDueNotifications())
);

server.registerTool(
  "send_notification_now",
  {
    title: "Send notification now",
    description: "Send a notification task immediately.",
    inputSchema: reviewIdSchema
  },
  async ({ reviewId }) => toToolResult(await clientFromEnv().sendNotificationNow(reviewId))
);

server.registerTool(
  "cancel_notification",
  {
    title: "Cancel notification",
    description: "Cancel a pending notification task.",
    inputSchema: reviewIdSchema
  },
  async ({ reviewId }) => toToolResult(await clientFromEnv().cancelNotification(reviewId))
);

server.registerTool(
  "rerun_notification",
  {
    title: "Rerun notification",
    description: "Requeue a failed or canceled notification task.",
    inputSchema: reviewIdSchema
  },
  async ({ reviewId }) => toToolResult(await clientFromEnv().rerunNotification(reviewId))
);

server.registerTool(
  "get_settings_bootstrap",
  {
    title: "Get settings bootstrap",
    description: "Read masked settings bootstrap state. Does not expose secrets.",
    inputSchema: {}
  },
  async () => toToolResult(await clientFromEnv().bootstrap())
);

server.registerTool(
  "set_publish_mode",
  {
    title: "Set publish mode",
    description: "Turn Review Pilot publish test mode on or off.",
    inputSchema: {
      publishTestMode: z.boolean().describe("true keeps publishes internal to Review Pilot; false allows live Google publish")
    }
  },
  async ({ publishTestMode }) => toToolResult(await clientFromEnv().setPublishMode(publishTestMode))
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Review Pilot MCP server running on stdio");
}

function toToolResult(result: AgentResult) {
  const normalized = result.ok ? result : fail(result.error?.message ?? "Tool call failed", result.error?.status, result.error?.details, result.nextActions);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(normalized, null, 2)
      }
    ],
    structuredContent: normalized,
    isError: !normalized.ok
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
