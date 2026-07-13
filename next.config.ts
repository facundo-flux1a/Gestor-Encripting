import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  serverExternalPackages: [
    '@genkit-ai/core',
    '@genkit-ai/googleai',
    '@opentelemetry/instrumentation',
    '@opentelemetry/sdk-node',
    'genkit',
    'unrar-js',
    'node-unrar-js',
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;