import { Inject, Injectable } from "@nestjs/common";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { SettingsService } from "./settings.service.js";

type CodexLoginSession = {
  id: string;
  status: "running" | "ready" | "failed" | "expired";
  startedAt: string;
  finishedAt?: string;
  stdout: string;
  stderr: string;
  loginUrl?: string;
  userCode?: string;
  error?: string;
};

@Injectable()
export class CodexRuntimeService {
  private loginSession: CodexLoginSession | null = null;

  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  async testRuntime() {
    const settings = await this.settings.getCodexSettings();
    const [version, login] = await Promise.all([
      run("codex", ["--version"], { env: runtimeEnv(settings), cwd: settings.codexWorkdir }),
      run("codex", ["login", "status"], { env: runtimeEnv(settings), cwd: settings.codexWorkdir })
    ]);
    const installed = version.code === 0;
    const loggedIn = login.code === 0 && /logged in/i.test(`${login.stdout}\n${login.stderr}`);
    return {
      ok: installed && loggedIn,
      installed,
      loggedIn,
      codexVersion: version.stdout.trim(),
      loginStatus: (login.stdout || login.stderr).trim(),
      error: installed && loggedIn ? null : [version.stderr, login.stderr].filter(Boolean).join("\n").trim(),
      codexHomeConfigured: Boolean(settings.codexHome),
      model: settings.model
    };
  }

  async startDeviceLogin() {
    const settings = await this.settings.getCodexSettings();
    if (this.loginSession?.status === "running") {
      return this.publicLoginSession();
    }

    this.loginSession = {
      id: randomUUID(),
      status: "running",
      startedAt: new Date().toISOString(),
      stdout: "",
      stderr: ""
    };

    const session = this.loginSession;
    const child = spawnCodex(["login", "--device-auth"], {
      env: runtimeEnv(settings),
      cwd: settings.codexWorkdir
    });

    const updateOutput = () => {
      const parsed = parseDeviceAuthOutput(`${session.stdout}\n${session.stderr}`);
      session.loginUrl = parsed.loginUrl;
      session.userCode = parsed.userCode;
    };

    const timeout = setTimeout(() => {
      if (session.status === "running") {
        child.kill();
        session.status = "expired";
        session.finishedAt = new Date().toISOString();
        session.error = "Codex device login expired";
      }
    }, 10 * 60 * 1000);

    child.stdout.on("data", (chunk: Buffer) => {
      session.stdout += chunk.toString("utf8");
      updateOutput();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      session.stderr += chunk.toString("utf8");
      updateOutput();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      session.status = "failed";
      session.finishedAt = new Date().toISOString();
      session.error = error.message;
    });
    child.on("close", async (code) => {
      clearTimeout(timeout);
      session.finishedAt = new Date().toISOString();
      if (code === 0 || (await this.isLoggedIn(settings))) {
        session.status = "ready";
        return;
      }
      if (session.status === "running") {
        session.status = "failed";
        session.error = session.stderr.trim() || `codex login exited with code ${code}`;
      }
    });

    return this.publicLoginSession();
  }

  async getDeviceLoginStatus() {
    const settings = await this.settings.getCodexSettings();
    const status = await run("codex", ["login", "status"], {
      env: runtimeEnv(settings),
      cwd: settings.codexWorkdir
    });
    const loggedIn = status.code === 0 && /logged in/i.test(`${status.stdout}\n${status.stderr}`);
    if (loggedIn && this.loginSession?.status === "running") {
      this.loginSession.status = "ready";
      this.loginSession.finishedAt = new Date().toISOString();
    }

    return {
      loggedIn,
      loginStatus: (status.stdout || status.stderr).trim(),
      session: this.publicLoginSession()
    };
  }

  private async isLoggedIn(settings: Awaited<ReturnType<SettingsService["getCodexSettings"]>>) {
    const status = await run("codex", ["login", "status"], {
      env: runtimeEnv(settings),
      cwd: settings.codexWorkdir
    });
    return status.code === 0 && /logged in/i.test(`${status.stdout}\n${status.stderr}`);
  }

  private publicLoginSession() {
    if (!this.loginSession) {
      return null;
    }
    return {
      id: this.loginSession.id,
      status: this.loginSession.status,
      startedAt: this.loginSession.startedAt,
      finishedAt: this.loginSession.finishedAt,
      loginUrl: this.loginSession.loginUrl,
      userCode: this.loginSession.userCode,
      output: sanitizeLoginOutput(`${this.loginSession.stdout}\n${this.loginSession.stderr}`),
      error: this.loginSession.error
    };
  }
}

function runtimeEnv(settings: { codexHome: string; model: string }): NodeJS.ProcessEnv {
  return {
    ...pickEnv([
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
    ]),
    CODEX_HOME: settings.codexHome,
    CODEX_MODEL: settings.model
  };
}

function pickEnv(names: string[]): NodeJS.ProcessEnv {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = process.env[name];
      return value ? [[name, value]] : [];
    })
  );
}

async function run(command: string, args: string[], options?: { env?: NodeJS.ProcessEnv; cwd?: string }) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawnCodex(args, options, command);

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      resolve({ code: -1, stdout: "", stderr: error.message });
    });
    child.on("close", (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      });
    });
  });
}

function spawnCodex(args: string[], options?: { env?: NodeJS.ProcessEnv; cwd?: string }, command = "codex") {
  const processCommand = process.platform === "win32" ? "cmd.exe" : command;
  const processArgs = process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;

  return spawn(processCommand, processArgs, {
    shell: false,
    env: options?.env ?? process.env,
    cwd: options?.cwd
  });
}

function parseDeviceAuthOutput(output: string): { loginUrl?: string; userCode?: string } {
  const loginUrl = output.match(/https?:\/\/\S+/)?.[0]?.replace(/[),.]+$/, "");
  const explicitCode = output.match(/(?:code|enter)\D+([A-Z0-9-]{4,})/i)?.[1];
  const fallbackCode = output.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/)?.[0];
  return {
    loginUrl,
    userCode: explicitCode ?? fallbackCode
  };
}

function sanitizeLoginOutput(output: string): string {
  return output
    .replace(/(access[_-]?token|refresh[_-]?token|id[_-]?token)["':=\s]+[A-Za-z0-9._-]+/gi, "$1=[redacted]")
    .slice(-4000)
    .trim();
}
