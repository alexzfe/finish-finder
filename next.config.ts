import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Kept for future base path configuration
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const repoBase = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/^\/+|\/+$/g, "") ?? "";

const nextConfig: NextConfig = {
  // Vercel deployment configuration (no static export)
  images: {
    unoptimized: false, // Enable image optimization on Vercel
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default withSentryConfig(
  nextConfig,
  {
    silent: true
  }
);
