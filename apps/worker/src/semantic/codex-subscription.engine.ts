import { Inject, Injectable } from "@nestjs/common";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";
import {
  AnalyzeReviewInputSchema,
  AnalyzeReviewOutputSchema,
  type AnalyzeReviewInput,
  type AnalyzeReviewOutput,
  type RegenerateReplyInput
} from "@review-pilot/shared";
import type { SemanticEngine } from "./semantic-engine.js";
import { SettingsService } from "../settings/settings.service.js";

@Injectable()
export class CodexSubscriptionEngine implements SemanticEngine {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  async analyzeReview(input: AnalyzeReviewInput): Promise<AnalyzeReviewOutput> {
    const review = AnalyzeReviewInputSchema.parse(input);
    return this.runCodex(buildAnalyzePrompt(review));
  }

  async regenerateReply(input: RegenerateReplyInput): Promise<AnalyzeReviewOutput> {
    return this.runCodex(buildRegeneratePrompt(input));
  }

  private async runCodex(prompt: string): Promise<AnalyzeReviewOutput> {
    const settings = await this.settings.getCodexSettings();
    await ensureRuntimeDirs(settings);
    const tempDir = await mkdtemp(join(tmpdir(), "review-pilot-codex-"));
    const promptPath = join(tempDir, "prompt.md");
    const outputPath = join(tempDir, "output.json");
    const schemaPath = join(tempDir, "schema.json");

    try {
      await writeFile(promptPath, prompt, "utf8");
      await writeFile(schemaPath, reviewAnalysisJsonSchema, "utf8");
      await runProcess("codex", [
        "exec",
        "-c",
        "approval_policy=\"never\"",
        "--skip-git-repo-check",
        "--ephemeral",
        "--sandbox",
        "read-only",
        "-m",
        settings.model,
        "--output-schema",
        schemaPath,
        "-o",
        outputPath,
        "-"
      ], {
        stdinFile: promptPath,
        cwd: settings.codexWorkdir,
        env: codexEnv(settings.codexHome, settings.model)
      });

      const raw = await readFile(outputPath, "utf8");
      return AnalyzeReviewOutputSchema.parse(JSON.parse(raw));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function ensureRuntimeDirs(settings: { codexHome: string; codexWorkdir: string }) {
  await Promise.all([
    mkdir(settings.codexHome, { recursive: true }),
    mkdir(settings.codexWorkdir, { recursive: true })
  ]);
}

function codexEnv(codexHome: string, model: string): NodeJS.ProcessEnv {
  const env = pickEnv([
    "PATH",
    "Path",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "SystemRoot",
    "COMSPEC",
    "ComSpec",
    "TEMP",
    "TMP",
    "TMPDIR",
    "SSL_CERT_FILE",
    "CODEX_CA_CERTIFICATE"
  ]);
  const path = codexRuntimePath(env);
  return {
    ...env,
    PATH: path,
    Path: path,
    CODEX_HOME: codexHome,
    CODEX_MODEL: model
  };
}

function codexRuntimePath(env: NodeJS.ProcessEnv): string {
  const current = env.PATH ?? env.Path ?? "";
  return [
    join(process.cwd(), "node_modules", ".bin"),
    join(process.cwd(), "..", "..", "node_modules", ".bin"),
    "/app/node_modules/.bin",
    "/mise/shims",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    current
  ]
    .filter(Boolean)
    .join(delimiter);
}

function pickEnv(names: string[]): NodeJS.ProcessEnv {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = process.env[name];
      return value ? [[name, value]] : [];
    })
  );
}

const reviewAnalysisJsonSchema = JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "severity",
    "priority",
    "issues",
    "positives",
    "keywords",
    "draftReply",
    "publishRisk",
    "reasoning"
  ],
  properties: {
    severity: { type: "string", enum: ["green", "yellow", "red"] },
    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
    issues: { type: "array", items: { type: "string" }, maxItems: 5 },
    positives: { type: "array", items: { type: "string" }, maxItems: 5 },
    keywords: { type: "array", items: { type: "string" }, maxItems: 8 },
    draftReply: { type: "string", minLength: 20, maxLength: 1200 },
    publishRisk: {
      type: "object",
      additionalProperties: false,
      required: ["requiresHumanReview", "reasons"],
      properties: {
        requiresHumanReview: { type: "boolean" },
        reasons: { type: "array", items: { type: "string" }, maxItems: 5 }
      }
    },
    reasoning: { type: "string", maxLength: 800 }
  }
});

function buildAnalyzePrompt(review: AnalyzeReviewInput): string {
  return `You are the semantic review engine for Review Pilot.

Analyze this Google Business Profile review and produce a business-safe reply draft.

Rules:
- Return only data that matches the provided JSON schema.
- Do not run tools.
- Do not edit files.
- Do not browse the web.
- Do not include markdown.
- The reply should be concise, specific, professional, and natural.
- If historical replies are provided, learn their tone and structure without copying wording.
- If the review mentions food safety, discrimination, legal threats, refunds, illness, pests, harassment, or extreme accusations, mark publishRisk.requiresHumanReview as true.

Review:
${JSON.stringify(review, null, 2)}

Historical reply examples:
${formatHistoricalReplies(review)}
`;
}

function buildRegeneratePrompt(input: RegenerateReplyInput): string {
  return `${buildAnalyzePrompt(input.review)}

Current draft:
${input.currentDraft}

Owner regeneration instruction:
${input.ownerInstruction}
`;
}

function formatHistoricalReplies(review: AnalyzeReviewInput): string {
  if (!review.historicalReplies.length) {
    return "None.";
  }

  return review.historicalReplies
    .map((example, index) => {
      const reviewPreview = example.reviewText.length > 220 ? `${example.reviewText.slice(0, 220)}...` : example.reviewText;
      return `Example ${index + 1}\nReview (${example.rating}/5): ${reviewPreview}\nBusiness reply: ${example.reply}`;
    })
    .join("\n\n");
}

async function runProcess(
  command: string,
  args: string[],
  options: { stdinFile: string; cwd: string; env: NodeJS.ProcessEnv }
): Promise<void> {
  const stdin = await readFile(options.stdinFile);
  const processCommand = process.platform === "win32" ? "cmd.exe" : command;
  const processArgs =
    process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;

  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(processCommand, processArgs, {
      cwd: options.cwd,
      env: options.env,
      shell: false
    });

    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.stdin.end(stdin);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      reject(
        new Error(
          `codex exec failed with exit code ${code}: ${Buffer.concat(stderr).toString("utf8")}`
        )
      );
    });
  });
}
