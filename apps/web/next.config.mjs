import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

const nextConfig = (phase) => {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const githubPages = process.env.GITHUB_PAGES === "true";
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (githubPages ? "/review-pilot" : "");
  const staticExport = demoMode || githubPages;

  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
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
