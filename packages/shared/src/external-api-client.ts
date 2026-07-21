export type ExternalApiClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
};

export class ReviewPilotExternalApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ExternalApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  listReviews(query: Record<string, string | number | undefined> = {}) {
    return this.request("GET", `/reviews${queryString(query)}`);
  }

  getReview(reviewId: string) {
    return this.request("GET", `/reviews/${encodeURIComponent(reviewId)}`);
  }

  generateDraft(reviewId: string, body: unknown = {}, idempotencyKey = crypto.randomUUID()) {
    return this.request("POST", `/reviews/${encodeURIComponent(reviewId)}/draft-generations`, body, idempotencyKey);
  }

  reviseDraft(reviewId: string, body: unknown, idempotencyKey = crypto.randomUUID()) {
    return this.request("POST", `/reviews/${encodeURIComponent(reviewId)}/draft-revisions`, body, idempotencyKey);
  }

  publish(reviewId: string, body: unknown, idempotencyKey = crypto.randomUUID()) {
    return this.request("POST", `/reviews/${encodeURIComponent(reviewId)}/publish-attempts`, body, idempotencyKey);
  }

  getOperation(operationId: string) {
    return this.request("GET", `/operations/${encodeURIComponent(operationId)}`);
  }

  private async request(method: string, path: string, body?: unknown, idempotencyKey?: string) {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error((payload as { detail?: string } | null)?.detail ?? `Review Pilot API returned ${response.status}`);
      Object.assign(error, { status: response.status, payload });
      throw error;
    }
    return payload;
  }
}

function queryString(query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  return params.size ? `?${params.toString()}` : "";
}
