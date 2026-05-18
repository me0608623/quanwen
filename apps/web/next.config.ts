import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 未來接 React Native 時用 transpilePackages
  transpilePackages: ['shared-types'],
  images: {
    domains: ['lh3.googleusercontent.com'], // Google avatar
  },
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
