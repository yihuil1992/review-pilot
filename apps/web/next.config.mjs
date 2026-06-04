import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const nextConfig = (phase) => {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const githubPages = process.env.GITHUB_PAGES === "true";
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (githubPages ? "/review-pilot" : "");
  const staticExport = demoMode || githubPages;
  const apiProxyUrl = process.env.API_PROXY_URL?.replace(/\/$/, "");

  return {
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
