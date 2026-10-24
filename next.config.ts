import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No `output: "standalone"` — Vercel runs `next build` natively.
  poweredByHeader: false,
};

export default nextConfig;
