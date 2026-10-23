import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const nextConfig = (phase) => {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const githubPages = process.env.GITHUB_PAGES === "true";
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (githubPages ? "/review-pilot" : "");
  const staticExport = demoMode || githubPages;
  const apiProxyUrl = process.env.API_PROXY_URL?.replace(/\/$/, "");
  const publicOrigin = process.env.PUBLIC_WEB_ORIGIN ||
    (process.env.REVIEW_PILOT_TRIAL_MODE === "true" ? "https://reviews.shakingcrab.net" : "");
  if (publicOrigin && (new URL(publicOrigin).protocol !== "https:" || new URL(publicOrigin).origin !== publicOrigin)) {
    throw new Error("PUBLIC_WEB_ORIGIN must be an HTTPS origin without a path");
  }

  return {
    ...(process.env.NEXT_BUILD_CPUS ? { experimental: { cpus: Number(process.env.NEXT_BUILD_CPUS) } } : {}),
    ...(publicOrigin ? {
      async redirects() {
        return [{
          source: "/:path*",
          has: [{ type: "header", key: "cf-visitor", value: '.*"scheme"\\s*:\\s*"http".*' }],
          destination: `${publicOrigin}/:path*`,
          permanent: true
        }];
      },
      async headers() {
        return [{ source: "/:path*", headers: [
          { key: "Strict-Transport-Security", value: "max-age=86400" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" }
        ] }];
      }
    } : {}),
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    ...(apiProxyUrl
      ? {
          async rewrites() {
            return [
              {
                source: "/api/:path*",
                destination: `${apiProxyUrl}/api/:path*`
              }
            ];
          }
        }
      : {}),
    ...(staticExport
      ? {
          output: "export",
          trailingSlash: true,
          images: {
            unoptimized: true
          }
        }
      : {}),
    ...(basePath ? { assetPrefix: basePath, basePath } : {}),
    transpilePackages: ["@review-pilot/shared"]
  };
};

export default nextConfig;
