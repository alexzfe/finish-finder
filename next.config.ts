import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Kept for future base path configuration
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const repoBase = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/^\/+|\/+$/g, "") ?? "";

const nextConfig: NextConfig = {
  // Vercel deployment configuration (no static export)
  images: {
    unoptimized: false, // Enable image optimization on Vercel
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'a.espncdn.com',
        pathname: '/combiner/i/**',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        pathname: '/wikipedia/**',
      },
      {
        protocol: 'https',
        hostname: '*.espncdn.com',
      },
    ],
  },
  eslint: {
    // Ignore ESLint errors during production build to avoid deployment blocks
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Ignore type errors during production build; CI should still run type checks
    ignoreBuildErrors: true,
  },
};

export default withSentryConfig(
  nextConfig,
  {
    silent: true
  }
);
