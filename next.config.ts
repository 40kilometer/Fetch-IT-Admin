import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.LOCAL_RIDER_LAB === '1' && process.env.NODE_ENV !== 'production' ? '.next-local-rider-lab' : '.next',
  // No `output: "standalone"` — Vercel runs `next build` natively.
  poweredByHeader: false,
};

export default nextConfig;
