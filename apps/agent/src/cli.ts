#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { clientFromEnv, fail, type AgentResult, type JsonObject } from "./api-client.js";

type ParsedArgs = {
  positionals: string[];
  flags: Map<string, string | boolean>;
};

const mutatingCommands = new Set([
  "reviews:generate",
  "reviews:regenerate",
  "reviews:publish-test",
  "reviews:publish-live",
  "reviews:mark-handled",
  "notifications:run-due",
  "notifications:send-now",
  "notifications:cancel",
  "notifications:rerun",
  "settings:publish-mode"
]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [scope, action, id] = args.positionals;

  if (!scope || flag(args, "help") || scope === "help") {
    printHelp();
    return;
  }

  const commandKey = [scope, action].filter(Boolean).join(":");
  if (flag(args, "dry-run") && mutatingCommands.has(commandKey)) {
    return output(args, {
      ok: true,
      data: {
        dryRun: true,
        command: args.positionals,
        wouldCallApi: true
      }
    });
  }

  const client = clientFromEnv();
  let result: AgentResult;

  if (scope === "status") {
    result = await client.status();
  } else if (scope === "doctor") {
    result = await client.doctor();
  } else if (scope === "demo" && action === "build") {
    result = runDemoBuild();
  } else if (scope === "settings" && action === "bootstrap") {
    result = await client.bootstrap();
  } else if (scope === "settings" && action === "publish-mode") {
    const value = parseBoolean(id);
    result = typeof value === "boolean"
      ? await client.setPublishMode(value)
      : fail("Usage: review-pilot settings publish-mode <true|false>", 1);
  } else if (scope === "reviews" && action === "list") {
    result = await client.listReviews({
      status: enumFlag(args, "status", ["unhandled", "all"]),
      locationId: stringFlag(args, "location-id"),
      severity: enumFlag(args, "severity", ["green", "yellow", "red"]),
      rating: numberFlag(args, "rating")
    });
  } else if (scope === "reviews" && action === "get" && id) {
    result = await client.getReview(id);
  } else if (scope === "reviews" && action === "generate" && id) {
    result = await client.generateReviewDraft(id);
  } else if (scope === "reviews" && action === "regenerate" && id) {
    const instruction = stringFlag(args, "instruction");
    result = instruction
      ? await client.regenerateReviewDraft(id, instruction)
      : fail("Usage: review-pilot reviews regenerate <reviewId> --instruction <text>", 1);
  } else if (scope === "reviews" && action === "publish-test" && id) {
    result = await client.publishTestReply(id, stringFlag(args, "body"), flag(args, "enable-test-mode"));
  } else if (scope === "reviews" && action === "publish-live" && id) {
    result = await client.publishLiveReply(id, stringFlag(args, "body"), flag(args, "confirm-live"));
  } else if (scope === "reviews" && action === "mark-handled" && id) {
    result = await client.markReviewHandled(id);
  } else if (scope === "notifications" && action === "list") {
    result = await client.listNotificationTasks({
      status: enumFlag(args, "status", ["pending", "sent", "failed", "canceled", "none"])
    });
  } else if (scope === "notifications" && action === "sync-status") {
    result = await client.getReviewSyncStatus();
  } else if (scope === "notifications" && action === "run-due") {
    result = await client.runDueNotifications();
  } else if (scope === "notifications" && action === "send-now" && id) {
    result = await client.sendNotificationNow(id);
  } else if (scope === "notifications" && action === "cancel" && id) {
    result = await client.cancelNotification(id);
  } else if (scope === "notifications" && action === "rerun" && id) {
    result = await client.rerunNotification(id);
  } else {
    result = fail(`Unknown command: ${args.positionals.join(" ")}`, 1);
  }

  output(args, result);
  if (!result.ok) {
    process.exit(exitCode(result));
  }
}

function output(args: ParsedArgs, result: AgentResult) {
  if (flag(args, "json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.ok) {
    console.error(`Error: ${result.error?.message ?? "Command failed"}`);
    if (result.nextActions?.length) {
      console.error("Next actions:");
      for (const action of result.nextActions) {
        console.error(`- ${action}`);
      }
    }
    return;
  }
  printHuman(result.data);
}

function printHuman(data: unknown) {
  if (Array.isArray(data)) {
    console.table(data.map(compactRecord));
    return;
  }
  if (data && typeof data === "object") {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(String(data ?? "ok"));
}

function compactRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return { value };
  }
  const record = value as JsonObject;
  return Object.fromEntries(
    Object.entries(record).filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item))
  );
}

function runDemoBuild(): AgentResult {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const result = spawnSync("pnpm", ["demo:build"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: true
  });
  return result.status === 0 ? { ok: true, data: { command: "pnpm demo:build" } } : fail("Demo build failed", result.status ?? 1);
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      if (token) {
        positionals.push(token);
      }
      continue;
    }
    const [rawName, inlineValue] = token.slice(2).split("=", 2);
    if (!rawName) {
      continue;
    }
    if (inlineValue !== undefined) {
      flags.set(rawName, inlineValue);
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(rawName, next);
      index += 1;
    } else {
      flags.set(rawName, true);
    }
  }
  return { positionals, flags };
}

function flag(args: ParsedArgs, name: string) {
  return args.flags.get(name) === true;
}

function stringFlag(args: ParsedArgs, name: string) {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function numberFlag(args: ParsedArgs, name: string) {
  const value = stringFlag(args, name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function enumFlag<T extends string>(args: ParsedArgs, name: string, values: readonly T[]): T | undefined {
  const value = stringFlag(args, name);
  return values.includes(value as T) ? value as T : undefined;
}

function parseBoolean(value: string | undefined) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function exitCode(result: AgentResult) {
  const status = result.error?.status;
  if (status === 401 || status === 403) {
    return 2;
  }
  if (status && status >= 500) {
    return 3;
  }
  return 1;
}

function printHelp() {
  console.log(`Review Pilot agent CLI

Usage:
  review-pilot status [--json]
  review-pilot doctor [--json]
  review-pilot reviews list [--status unhandled|all] [--severity green|yellow|red] [--rating 1-5] [--json]
  review-pilot reviews get <reviewId> [--json]
  review-pilot reviews generate <reviewId> [--json]
  review-pilot reviews regenerate <reviewId> --instruction <text> [--json]
  review-pilot reviews publish-test <reviewId> [--body <text>] [--enable-test-mode] [--json]
  review-pilot reviews publish-live <reviewId> [--body <text>] --confirm-live [--json]
  review-pilot reviews mark-handled <reviewId> [--json]
  review-pilot notifications list [--status pending|sent|failed|canceled|none] [--json]
  review-pilot notifications sync-status [--json]
  review-pilot notifications run-due [--json]
  review-pilot notifications send-now|cancel|rerun <reviewId> [--json]
  review-pilot settings bootstrap [--json]
  review-pilot settings publish-mode <true|false> [--json]
  review-pilot demo build

Environment:
  REVIEW_PILOT_API_BASE_URL       Defaults to http://localhost:4000/api
  REVIEW_PILOT_OWNER_PASSWORD     Used for automatic owner login
  REVIEW_PILOT_COOKIE             Authenticated cookie header alternative
  REVIEW_PILOT_CSRF               CSRF token when using REVIEW_PILOT_COOKIE

Safety:
  Mutating commands support --dry-run.
  Live publish requires --confirm-live and server publish test mode must be off.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
