import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  distDir: 'out',
  basePath: '/mc',
  assetPrefix: '/mc',
};

export default nextConfig;
