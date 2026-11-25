import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ["@react-pdf/renderer", "z-ai-web-dev-sdk"],
  allowedDevOrigins: ["*.space-z.ai"],
};

export default nextConfig;
