import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const APP_ROOT = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  reactCompiler: true,
  outputFileTracingRoot: APP_ROOT,
  turbopack: {
    root: APP_ROOT,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
