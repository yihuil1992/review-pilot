import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

export function loadEnv() {
  const envPath = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../..", ".env")].find((path) =>
    existsSync(path)
  );

  config(envPath ? { path: envPath } : undefined);
}

loadEnv();
