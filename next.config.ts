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
        source: '/minio-proxy/:path*',
        destination: `${process.env.MINIO_ENDPOINT}/${process.env.MINIO_BUCKET_NAME}/:path*`,
      },
    ];
  },
};

export default nextConfig;