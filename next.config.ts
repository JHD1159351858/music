import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),  // Uncomment and add 'import path from "path"' if needed
  /* config options here */
  allowedDevOrigins: ['*.cxiagents.com'],

  // 生产关闭浏览器端 sourcemap，减少构建与运行时内存占用
  productionBrowserSourceMaps: false,

  // Next.js 16 构建默认使用 Turbopack，不再保留自定义 webpack 配置（存在时构建会直接中止）
  experimental: {
    // 大体积库按需导入，降低打包体积与运行时内存
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
