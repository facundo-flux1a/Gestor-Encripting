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
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.modules = [
      path.join(root, 'node_modules'),
      ...(config.resolve.modules || ['node_modules']),
    ];
    // Force client bundle to use the same React instance (prevents createContext errors on frontend)
    // Server bundle MUST NOT be aliased so Next.js internal RSC dispatcher is preserved
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        react: path.resolve(path.join(root, 'node_modules/react')),
        'react-dom': path.resolve(path.join(root, 'node_modules/react-dom')),
      };
    }
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
    '@opentelemetry/instrumentation',
    '@opentelemetry/sdk-node',
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
