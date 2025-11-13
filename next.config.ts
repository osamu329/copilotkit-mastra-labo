import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ['@mastra/core', '@mastra/client-js'],
};

export default nextConfig;
