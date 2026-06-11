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
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    serverExternalPackages: [
      '@genkit-ai/core',
      '@genkit-ai/googleai',
      '@opentelemetry/instrumentation',
      '@opentelemetry/sdk-node',
      'genkit',
    ],
  },
};

export default nextConfig;