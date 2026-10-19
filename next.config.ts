import type { NextConfig } from 'next';

// 生产判定：与 server.ts 双条件一致。next build 自动设 NODE_ENV=production，故构建期 isProd=true，产出生产配置
const isProd =
  process.env.CODER_PROJECT_ENV === 'PROD' ||
  process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.cxiagents.com'],

  // 生产关闭浏览器端 sourcemap，减少构建与运行时内存占用
  productionBrowserSourceMaps: false,

  // Next.js 16 构建默认使用 Turbopack，不再保留自定义 webpack 配置（存在时构建会直接中止）
  experimental: {
    // 构建 worker 数对齐容器 CPU 配额（build.sh 注入 NEXT_BUILD_CPUS）。
    // 未注入时为 undefined，Next 回退固定 4 worker，小配额容器仍可能被打满——因此必须依赖 build.sh 注入本值。
    cpus: process.env.NEXT_BUILD_CPUS
      ? Number(process.env.NEXT_BUILD_CPUS)
      : undefined,
    // 大体积库按需导入，降低打包体积与运行时内存
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'recharts',
      '@supabase/supabase-js',
      'react-day-picker',
      '@aws-sdk/client-s3',
      '@aws-sdk/lib-storage',
      'embla-carousel-react',
      'drizzle-orm',
      'vaul',
      'cmdk',
      'input-otp',
      'fast-xml-parser',
    ],
    // 生产关预加载省常驻内存；dev 由框架自身禁用（源码 !options.dev 守卫），此值在 dev 无实际效果
    preloadEntriesOnStart: !isProd,
  },

  images: {
    // dev 关图片优化：首屏 GIF 优化零收益却要加载 sharp 并刷警告；生产保留优化
    unoptimized: !isProd,
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
