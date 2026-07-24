import type { NextConfig } from 'next';
import path from 'path';

const root = path.join(__dirname);

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Evita que Turbopack/Next tome /home/kornegor como root por un package-lock.json padre
  outputFileTracingRoot: root,
  turbopack: {
    root,
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.modules = [
      path.join(root, 'node_modules'),
      ...(config.resolve.modules || ['node_modules']),
    ];
    return config;
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
    'bullmq',
    'ioredis',
    '@ioredis/commands',
    'redis',
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
