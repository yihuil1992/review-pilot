import type { ExternalApiRequest } from "./api-auth.types.js";

export function apiData<T>(request: ExternalApiRequest, data: T) {
  return { data, meta: { requestId: request.requestId ?? "unknown" } };
}

export function apiList<T>(request: ExternalApiRequest, data: T[], nextCursor: string | null) {
  return { data, page: { nextCursor }, meta: { requestId: request.requestId ?? "unknown" } };
}
