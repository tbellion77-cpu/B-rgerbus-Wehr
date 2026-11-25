import type { NextConfig } from "next";

// Statischer Export: läuft auf jedem Webspace (Vercel, Stadt-Server), kein eigener Server nötig.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  devIndicators: false,
  turbopack: { root: __dirname },
};

export default nextConfig;
