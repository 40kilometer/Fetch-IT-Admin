import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No `output: "standalone"` — Vercel runs `next build` natively.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
