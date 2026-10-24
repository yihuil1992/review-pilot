/** HTTP destinations require an explicit operator-owned exact-URL allowlist. */
export function assertWebhookDestinationAllowed(value: string, allowlistJson = "[]"): void {
  const url = new URL(value);
  if (url.username || url.password || url.hash) throw new Error("Webhook URLs cannot contain credentials or fragments");
  if (url.protocol === "https:") return;
  if (url.protocol !== "http:") throw new Error("Unsupported webhook URL protocol");

  let allowed: unknown;
  try { allowed = JSON.parse(allowlistJson); } catch { throw new Error("Invalid WEBHOOK_ALLOWED_HTTP_URLS configuration"); }
  if (!Array.isArray(allowed) || !allowed.every((entry) => typeof entry === "string")) {
    throw new Error("WEBHOOK_ALLOWED_HTTP_URLS must be a JSON array of exact URLs");
  }
  if (url.href !== value || !allowed.includes(value)) {
    throw new Error("HTTP webhook URL is not explicitly allowed by this server");
  }
}
