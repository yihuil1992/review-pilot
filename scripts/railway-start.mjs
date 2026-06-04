import { spawn } from "node:child_process";

const serviceName = process.env.RAILWAY_SERVICE_NAME?.toLowerCase();

const commandByService = {
  api: ["pnpm", ["start:api"]],
  worker: ["pnpm", ["start:worker"]],
  web: ["pnpm", ["start:web"]]
};

const command = serviceName ? commandByService[serviceName] : null;

if (!command) {
  console.error(`Unsupported Railway service: ${process.env.RAILWAY_SERVICE_NAME ?? "(unset)"}`);
  console.error(`Expected one of: ${Object.keys(commandByService).join(", ")}`);
  process.exit(1);
}

const [bin, args] = command;
const child = spawn(bin, args, {
  stdio: "inherit",
  shell: process.platform === "win32"
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`${bin} exited with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
