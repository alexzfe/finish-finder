import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const repoBase = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/^\/+|\/+$/g, "") ?? "";

const nextConfig: NextConfig = {
  // Only enable static export for production builds, not development
  ...(process.env.NODE_ENV === 'production' ? {
    output: "export",
    distDir: "out",
  } : {}),
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  ...(repoBase && process.env.NODE_ENV === 'production'
    ? {
        basePath: `/${repoBase}`,
        assetPrefix: `/${repoBase}/`,
      }
    : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default withSentryConfig(
  nextConfig,
  {
    silent: true
  },
  {
    hideSourceMaps: true
  }
);
