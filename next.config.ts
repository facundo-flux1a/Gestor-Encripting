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
    // No se fuerzan aliases de React: Next debe resolver sus entradas
    // `react-server` y cliente según el contexto de cada componente.
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
