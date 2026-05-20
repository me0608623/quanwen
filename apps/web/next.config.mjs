/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['shared-types'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'profile.line-scdn.net' },
      { protocol: 'https', hostname: '*.line-scdn.net' },
      { protocol: 'https', hostname: 'appleid.cdn-apple.com' },
    ],
  },
  // typedRoutes: 等 /dashboard 和 /tasks 頁面建好後再啟用

};

export default nextConfig;
