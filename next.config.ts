import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const basePath = isGitHubPages ? "/FlipPDF" : "";

const nextConfig: NextConfig = {
  ...(isGitHubPages ? {
    output: "export" as const,
    assetPrefix: basePath,
    trailingSlash: true,
  } : {}),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
