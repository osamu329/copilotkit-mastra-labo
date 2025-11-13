import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ['@mastra/core', '@mastra/client-js'],

  // Mark server-only packages as external to avoid bundling issues
  serverExternalPackages: ['pino', 'thread-stream', 'pino-pretty'],
};

export default nextConfig;
