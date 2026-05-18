/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['shared-types'],
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
  // typedRoutes: 等 /dashboard 和 /tasks 頁面建好後再啟用

};

export default nextConfig;
