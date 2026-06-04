export type JsonObject = Record<string, unknown>;

export type AgentResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: {
    message: string;
    status?: number;
    details?: unknown;
  };
  nextActions?: string[];
};

export type ClientOptions = {
  apiBaseUrl?: string;
  ownerPassword?: string;
  cookie?: string;
  csrfToken?: string;
};

export type ListReviewsOptions = {
  status?: "unhandled" | "all";
  locationId?: string;
  severity?: "green" | "yellow" | "red";
  rating?: number;
};

export type ListNotificationTasksOptions = {
  status?: "pending" | "sent" | "failed" | "canceled" | "none";
};

const defaultApiBaseUrl = "http://localhost:4000/api";

export class ReviewPilotClient {
  private readonly apiBaseUrl: string;
  private readonly ownerPassword?: string;
  private cookie: string;
  private csrfToken?: string;
  private loggedIn = false;

  constructor(options: ClientOptions = {}) {
    this.apiBaseUrl = stripTrailingSlash(options.apiBaseUrl ?? process.env.REVIEW_PILOT_API_BASE_URL ?? defaultApiBaseUrl);
    this.ownerPassword = options.ownerPassword ?? process.env.REVIEW_PILOT_OWNER_PASSWORD;
    this.cookie = options.cookie ?? process.env.REVIEW_PILOT_COOKIE ?? "";
    this.csrfToken = options.csrfToken ?? process.env.REVIEW_PILOT_CSRF;
  }

  health() {
    return this.request("GET", "/health", { auth: false });
  }

  ready() {
    return this.request("GET", "/ready", { auth: false });
  }

  bootstrap() {
    return this.request("GET", "/settings/bootstrap", { auth: false });
  }

  async status() {
    const [health, ready, bootstrap] = await Promise.all([this.health(), this.ready(), this.bootstrap()]);
    return combineResult({
      health,
      ready,
      bootstrap
    });
  }

  async doctor() {
    const status = await this.status();
    if (!status.ok) {
      return status;
    }
    const bootstrap = (status.data as JsonObject).bootstrap as AgentResult<JsonObject>;
    const checks = {
      api: Boolean(((status.data as JsonObject).health as AgentResult).ok),
      ready: Boolean(((status.data as JsonObject).ready as AgentResult).ok),
      ownerConfigured: Boolean(bootstrap.data?.ownerConfigured),
      publicBaseUrlConfigured: Boolean(bootstrap.data?.publicBaseUrlConfigured),
      googleConfigured: Boolean(bootstrap.data?.googleConfigured),
      codexConfigured: Boolean(bootstrap.data?.codexConfigured),
      twilioConfigured: Boolean(bootstrap.data?.twilioConfigured),
      publishTestMode: Boolean(bootstrap.data?.publishTestMode)
    };
    return ok({
      checks,
      ready: Object.entries(checks)
        .filter(([key]) => key !== "publishTestMode")
        .every(([, value]) => value)
    });
  }

  async listReviews(options: ListReviewsOptions = {}) {
    const query = new URLSearchParams();
    if (options.status) {
      query.set("status", options.status);
    }
    if (options.locationId) {
      query.set("locationId", options.locationId);
    }
    if (options.severity) {
      query.set("severity", options.severity);
    }
    if (options.rating) {
      query.set("rating", String(options.rating));
    }
    return this.request("GET", `/reviews${query.size ? `?${query.toString()}` : ""}`);
  }

  getReview(reviewId: string) {
    return this.request("GET", `/reviews/${encodeURIComponent(reviewId)}`);
  }

  generateReviewDraft(reviewId: string) {
    return this.request("POST", `/reviews/${encodeURIComponent(reviewId)}/generate`, { body: {} });
  }

  regenerateReviewDraft(reviewId: string, instruction: string) {
    return this.request("POST", `/reviews/${encodeURIComponent(reviewId)}/regenerate`, { body: { instruction } });
  }

  markReviewHandled(reviewId: string) {
    return this.request("POST", `/reviews/${encodeURIComponent(reviewId)}/manual-handled`, { body: {} });
  }

  async publishTestReply(reviewId: string, body?: string, enableTestMode = false) {
    const bootstrap = await this.bootstrap();
    if (!bootstrap.ok) {
      return bootstrap;
    }
    if (!Boolean((bootstrap.data as JsonObject).publishTestMode)) {
      if (!enableTestMode) {
        return fail("Publish test mode is off. Pass --enable-test-mode or enable it in Settings before test publishing.", 2, {
          publishTestMode: false
        }, ["review-pilot settings publish-mode true", "Open Settings and enable Test publish mode"]);
      }
      const mode = await this.setPublishMode(true);
      if (!mode.ok) {
        return mode;
      }
    }
    return this.publishReply(reviewId, body);
  }

  async publishLiveReply(reviewId: string, body: string | undefined, confirmLive: boolean) {
    if (!confirmLive) {
      return fail("Live publish requires --confirm-live.", 1, undefined, ["Use publish-test first", "Pass --confirm-live only when you intend to reply on Google"]);
    }
    const bootstrap = await this.bootstrap();
    if (!bootstrap.ok) {
      return bootstrap;
    }
    if (Boolean((bootstrap.data as JsonObject).publishTestMode)) {
      return fail("Server is still in publish test mode. Disable test mode in Settings before live publishing.", 2, {
        publishTestMode: true
      });
    }
    return this.publishReply(reviewId, body);
  }

  async publishReply(reviewId: string, body?: string) {
    const replyBody = body ?? await this.draftBodyForReview(reviewId);
    if (!replyBody) {
      return fail("No reply body supplied and the review has no AI draft.", 1, undefined, ["Run reviews generate first or pass --body"]);
    }
    return this.request("POST", `/reviews/${encodeURIComponent(reviewId)}/publish`, { body: { body: replyBody } });
  }

  listNotificationTasks(options: ListNotificationTasksOptions = {}) {
    const query = new URLSearchParams();
    if (options.status) {
      query.set("status", options.status);
    }
    return this.request("GET", `/notifications/tasks${query.size ? `?${query.toString()}` : ""}`);
  }

  getReviewSyncStatus() {
    return this.request("GET", "/notifications/review-sync-status");
  }

  runDueNotifications() {
    return this.request("POST", "/notifications/run-due", { body: {} });
  }

  sendNotificationNow(reviewId: string) {
    return this.request("POST", `/notifications/tasks/${encodeURIComponent(reviewId)}/send-now`, { body: {} });
  }

  cancelNotification(reviewId: string) {
    return this.request("POST", `/notifications/tasks/${encodeURIComponent(reviewId)}/cancel`, { body: {} });
  }

  rerunNotification(reviewId: string) {
    return this.request("POST", `/notifications/tasks/${encodeURIComponent(reviewId)}/rerun`, { body: {} });
  }

  setPublishMode(publishTestMode: boolean) {
    return this.request("POST", "/settings/publish-mode", { body: { publishTestMode } });
  }

  private async draftBodyForReview(reviewId: string): Promise<string | null> {
    const review = await this.getReview(reviewId);
    if (!review.ok || !review.data || typeof review.data !== "object") {
      return null;
    }
    const draft = (review.data as JsonObject).draft;
    if (!draft || typeof draft !== "object") {
      return null;
    }
    const body = (draft as JsonObject).body;
    return typeof body === "string" && body.trim() ? body : null;
  }

  private async ensureAuth() {
    if (this.cookie || this.loggedIn) {
      return;
    }
    if (!this.ownerPassword) {
      return;
    }
    const response = await fetch(`${this.apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: this.ownerPassword })
    });
    this.captureCookies(response);
    this.loggedIn = response.ok;
  }

  private async request(method: "GET" | "POST", path: string, options: { body?: unknown; auth?: boolean } = {}): Promise<AgentResult> {
    if (options.auth !== false) {
      await this.ensureAuth();
    }
    try {
      const headers: Record<string, string> = {
        Accept: "application/json"
      };
      if (this.cookie) {
        headers.Cookie = this.cookie;
      }
      if (method !== "GET") {
        headers["Content-Type"] = "application/json";
        if (this.csrfToken) {
          headers["X-CSRF-Token"] = this.csrfToken;
        }
      }
      const response = await fetch(`${this.apiBaseUrl}${path}`, {
        method,
        headers,
        body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined
      });
      this.captureCookies(response);
      const data = await parseJson(response);
      if (!response.ok) {
        return fail(extractMessage(data, response.statusText), response.status, data, authNextActions(response.status));
      }
      return ok(data);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Request failed", 3);
    }
  }

  private captureCookies(response: Response) {
    const setCookie = getSetCookieHeaders(response);
    if (!setCookie.length) {
      return;
    }
    const jar = new Map<string, string>();
    for (const cookie of this.cookie.split(";").map((part) => part.trim()).filter(Boolean)) {
      const [name, ...rest] = cookie.split("=");
      if (name) {
        jar.set(name, rest.join("="));
      }
    }
    for (const header of setCookie) {
      const pair = header.split(";")[0];
      if (!pair) {
        continue;
      }
      const index = pair.indexOf("=");
      if (index === -1) {
        continue;
      }
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      jar.set(name, value);
      if (name === "rp_csrf") {
        this.csrfToken = decodeURIComponent(value);
      }
    }
    this.cookie = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

export function clientFromEnv() {
  return new ReviewPilotClient();
}

export function ok<T>(data: T): AgentResult<T> {
  return { ok: true, data };
}

export function fail(message: string, status?: number, details?: unknown, nextActions?: string[]): AgentResult {
  return {
    ok: false,
    error: {
      message,
      status,
      details
    },
    ...(nextActions?.length ? { nextActions } : {})
  };
}

function combineResult(data: Record<string, AgentResult>): AgentResult {
  const failed = Object.values(data).find((result) => !result.ok);
  if (failed) {
    return {
      ok: false,
      data,
      error: failed.error
    };
  }
  return ok(data);
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object" && typeof (data as JsonObject).message === "string") {
    return (data as JsonObject).message as string;
  }
  return fallback || "Request failed";
}

function authNextActions(status?: number) {
  return status === 401
    ? [
        "Set REVIEW_PILOT_OWNER_PASSWORD for automatic login",
        "Or set REVIEW_PILOT_COOKIE and REVIEW_PILOT_CSRF from an authenticated owner session"
      ]
    : undefined;
}

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const combined = response.headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;=]+=)/).map((part) => part.trim()) : [];
}
