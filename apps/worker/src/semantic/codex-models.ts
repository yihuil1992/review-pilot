import { spawn } from "node:child_process";
import type { CodexModelOption } from "@review-pilot/shared";
import { z } from "zod";

const pageSchema = z.object({
  data: z.array(z.unknown()),
  nextCursor: z.string().nullable().optional()
});
const modelSchema = z.object({
  model: z.string().min(1),
  displayName: z.string().min(1),
  hidden: z.boolean().optional()
});

// Use the worker's own CLI/authentication. This connection only discovers models;
// it never starts a thread or exposes a network listener.
export function listCodexModels(
  options: { env: NodeJS.ProcessEnv; cwd: string },
  timeoutMs = 15_000
): Promise<CodexModelOption[]> {
  return new Promise((resolve, reject) => {
    const child = process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", "codex", "app-server"], { ...options, shell: false })
      : spawn("codex", ["app-server"], { ...options, shell: false });
    const models = new Map<string, CodexModelOption>();
    const cursors = new Set<string>();
    let pendingId = 0;
    let buffer = "";
    let received = 0;
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => finish(new Error("Codex model discovery timed out")), timeoutMs);

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
      killTimer.unref();
      if (error) reject(error);
      else resolve([...models.values()]);
    }

    function send(message: unknown) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    function requestPage(cursor?: string) {
      pendingId += 1;
      send({ id: pendingId, method: "model/list", params: { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) } });
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (settled) return;
      received += chunk.length;
      if (received > 1024 * 1024) return finish(new Error("Codex model response exceeded its limit"));
      buffer += chunk;
      let end: number;
      while (!settled && (end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        try {
          const message = JSON.parse(line);
          if (message?.id !== pendingId) continue;
          if (message.error || !message.result) return finish(new Error("Codex model discovery failed"));
          if (pendingId === 0) {
            send({ method: "initialized", params: {} });
            requestPage();
            continue;
          }
          const page = pageSchema.parse(message.result);
          for (const entry of page.data) {
            const parsed = modelSchema.safeParse(entry);
            if (parsed.success && !parsed.data.hidden) {
              models.set(parsed.data.model, { id: parsed.data.model, displayName: parsed.data.displayName });
            }
          }
          if (!page.nextCursor) return finish();
          if (cursors.has(page.nextCursor) || cursors.size >= 20) {
            return finish(new Error("Codex model pagination did not complete"));
          }
          cursors.add(page.nextCursor);
          requestPage(page.nextCursor);
        } catch {
          return finish(new Error("Codex returned an invalid model response"));
        }
      }
    });
    // Do not forward CLI diagnostics, which may include local account details.
    child.stderr.resume();
    child.stdin.on("error", () => finish(new Error("Codex model connection failed")));
    child.on("error", () => finish(new Error("Codex CLI could not start")));
    child.on("close", () => {
      if (killTimer) clearTimeout(killTimer);
      finish(new Error("Codex exited before returning its model list"));
    });
    send({ id: 0, method: "initialize", params: { clientInfo: { name: "review_pilot", title: "Review Pilot", version: "0.1.0" } } });
  });
}
