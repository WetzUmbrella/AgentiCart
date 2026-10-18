import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Spec sheets are read from data/ at runtime by the API routes.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**/*"],
  },
};

export default nextConfig;
