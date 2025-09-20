import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const repoBase = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/^\/+|\/+$/g, "") ?? "";

const nextConfig: NextConfig = {
  // Vercel deployment configuration (no static export)
  images: {
    unoptimized: false, // Enable image optimization on Vercel
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
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
