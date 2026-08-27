import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Local dev is exposed via a cloudflared quick tunnel whose *.trycloudflare.com
  // subdomain changes on every tunnel restart -- wildcard it once instead of
  // re-adding the exact host each time. Next.js blocks cross-origin dev
  // requests (including the HMR websocket) from unlisted origins by default.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
