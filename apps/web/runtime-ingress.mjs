/** Deployment values are evaluated per request, never embedded in the image. */
export function ingressPolicy(requestUrl, headers, env = process.env) {
  const url = new URL(requestUrl);
  const origin = env.PUBLIC_WEB_ORIGIN || "";
  const responseHeaders = {};
  if (origin) {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" || parsed.origin !== origin) {
      throw new Error("PUBLIC_WEB_ORIGIN must be an HTTPS origin without a path");
    }
    responseHeaders["Strict-Transport-Security"] = "max-age=86400";
    responseHeaders["X-Robots-Tag"] = "noindex, nofollow";
    let clientScheme;
    try { clientScheme = JSON.parse(headers.get("cf-visitor") || "{}").scheme; } catch { /* Ignore malformed proxy metadata. */ }
    if (clientScheme === "http") {
      return { redirect: origin + url.pathname + url.search, headers: responseHeaders };
    }
  }
  if ((url.pathname === "/api" || url.pathname.startsWith("/api/")) && env.API_PROXY_URL) {
    const upstream = new URL(env.API_PROXY_URL);
    if (!["http:", "https:"].includes(upstream.protocol) || upstream.username || upstream.password || upstream.search || upstream.hash || !["", "/"].includes(upstream.pathname)) {
      throw new Error("API_PROXY_URL must be an HTTP(S) origin");
    }
    return { rewrite: upstream.origin + url.pathname + url.search, headers: responseHeaders };
  }
  return { headers: responseHeaders };
}
