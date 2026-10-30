import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Spec sheets are read from data/ at runtime by the API routes.
  outputFileTracingIncludes: {
    "/api/**": ["./data/**/*"],
  },
  // lib/trust.ts reads PDF text to check evidence quotes; pdf-parse loads pdf.js and must not be bundled.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
