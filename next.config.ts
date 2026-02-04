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
      bodySizeLimit: '25mb',
    },
    middlewareClientMaxBodySize: '25mb',
  },
  async rewrites() {
    return [
      {
        source: '/s3-proxy/:path*',
        destination: 'http://flux1a-minio-32adec-164-68-127-171.traefik.me:9000/:path*',
      },
    ];
  },
};

export default nextConfig;