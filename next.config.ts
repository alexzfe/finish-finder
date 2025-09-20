import type { NextConfig } from "next";

const repoBase = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/^\/+|\/+$/g, "") ?? "";

const nextConfig: NextConfig = {
  output: "export",
  distDir: "out",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  ...(repoBase
    ? {
        basePath: `/${repoBase}`,
        assetPrefix: `/${repoBase}/`,
      }
    : {}),
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
