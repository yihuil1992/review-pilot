import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const envPath = resolve(process.cwd(), ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = unquoteEnvValue(trimmed.slice(equalsIndex + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const [rawCommand, ...args] = process.argv.slice(2);
if (!rawCommand) {
  console.error("Usage: node scripts/with-env.mjs <command> [...args]");
  process.exit(1);
}

const child = spawn(spawnCommand(rawCommand), spawnArgs(rawCommand, args), {
  env: process.env,
  shell: false,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

function unquoteEnvValue(value) {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function spawnCommand(command) {
  return process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : command;
}

function spawnArgs(command, args) {
  if (process.platform !== "win32") {
    return args;
  }
  return ["/d", "/s", "/c", [command, ...args].map(quoteCmdArg).join(" ")];
}

function quoteCmdArg(arg) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/(["^&|<>%])/g, "^$1")}"`;
}
