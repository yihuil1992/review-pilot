import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listCodexModels } from "./codex-models.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

function fakeChild() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true)
  });
  const requests: Array<{ id?: number; method: string; params: Record<string, unknown> }> = [];
  child.stdin.on("data", (chunk) => requests.push(JSON.parse(chunk.toString())));
  vi.mocked(spawn).mockReturnValue(child as unknown as ChildProcessWithoutNullStreams);
  const reply = (id: number, result: unknown) => child.stdout.write(`${JSON.stringify({ id, result })}\n`);
  return { child, requests, reply };
}

describe("worker Codex model discovery", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  it("initializes before listing, decodes fragmented output, follows pages and hides unavailable entries", async () => {
    const { child, requests, reply } = fakeChild();
    const result = listCodexModels({ cwd: "/runtime", env: { CODEX_HOME: "/runtime/auth" } });
    expect(requests.map((r) => r.method)).toEqual(["initialize"]);
    reply(0, { userAgent: "codex" });
    expect(requests.map((r) => r.method)).toEqual(["initialize", "initialized", "model/list"]);
    expect(requests[2]?.params.includeHidden).toBe(false);
    const page = Buffer.from(JSON.stringify({ id: 1, result: { data: [
      { model: "available-a", displayName: "Model α", hidden: false },
      { model: "hidden", displayName: "Hidden", hidden: true },
      { model: "invalid" }
    ], nextCursor: "page2" } }) + "\n");
    const split = page.indexOf(Buffer.from("α")) + 1;
    child.stdout.write(page.subarray(0, split));
    child.stdout.write(page.subarray(split));
    expect(requests[3]?.params.cursor).toBe("page2");
    reply(2, { data: [
      { model: "available-a", displayName: "Model α" },
      { model: "available-b", displayName: "Model B" }
    ], nextCursor: null });
    await expect(result).resolves.toEqual([{ id: "available-a", displayName: "Model α" }, { id: "available-b", displayName: "Model B" }]);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", 0);
  });

  it("does not expose raw RPC errors or stderr", async () => {
    const { child } = fakeChild();
    const result = listCodexModels({ cwd: "/runtime", env: {} });
    child.stderr.write("account-sensitive-diagnostic");
    child.stdout.write(JSON.stringify({ id: 0, error: { message: "account-sensitive-diagnostic" } }) + "\n");
    await expect(result).rejects.toThrow("Codex model discovery failed");
    child.emit("close", 1);
  });

  it("bounds an unresponsive CLI and force-stops it if termination is ignored", async () => {
    vi.useFakeTimers();
    const { child } = fakeChild();
    const result = listCodexModels({ cwd: "/runtime", env: {} }, 50);
    const rejected = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    await vi.advanceTimersByTimeAsync(1000);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", 0);
  });

  it("rejects repeated pagination cursors", async () => {
    const { child, reply } = fakeChild();
    const result = listCodexModels({ cwd: "/runtime", env: {} });
    reply(0, {});
    reply(1, { data: [], nextCursor: "same" });
    reply(2, { data: [], nextCursor: "same" });
    await expect(result).rejects.toThrow("pagination did not complete");
    child.emit("close", 0);
  });

  it.each(["invalid-json", "process-error", "early-exit"])("rejects %s without hanging", async (failure) => {
    const { child } = fakeChild();
    const result = listCodexModels({ cwd: "/runtime", env: {} });
    if (failure === "invalid-json") child.stdout.write("invalid json\n");
    if (failure === "process-error") child.emit("error", new Error("ENOENT"));
    if (failure === "early-exit") child.emit("close", 1);
    await expect(result).rejects.toThrow(/^Codex/);
    child.emit("close", 1);
  });
});
