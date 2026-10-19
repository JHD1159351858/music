import type { Metadata } from 'next';
import Script from 'next/script';

import { IframeSdkProvider } from '@/components/iframe-sdk-provider';
import { UserProvider } from '@/lib/user-context';
import { Toaster } from '@/components/ui/sonner';

import './globals.css';

export const metadata: Metadata = {
  title: '知音 · 教学智能体',
  description: '练琴记录、乐谱分析、练琴社区、音乐史地图与练琴数据分析一体化教学智能体',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className={`antialiased`}>
        {/**
          iframe-route-sync：子页面路由 ↔ 父页面地址双向同步
          iframe-error-sync：子页面 dev 错误上报到父页面调试面板
          iframe-element-picker：子页面元素选取能力
          beforeInteractive 策略确保应用代码执行前 SDK 已就绪。
        */}
        <Script
          src="https://robot.chaoxing.com/coder-sdk/iframe-route-sync/child.umd.js?v=1791442089423"
          strategy="beforeInteractive"
        />
        <Script
          src="https://robot.chaoxing.com/coder-sdk/iframe-error-sync/child.umd.js?v=1791442089423"
          strategy="beforeInteractive"
        />
        <Script
          src="https://robot.chaoxing.com/coder-sdk/iframe-element-picker/child.umd.js?v=1791442089423"
          strategy="beforeInteractive"
        />
        {/**
          error-sync 初始化：必须同样使用 beforeInteractive 交给 Next 运行时串行加载。
          App Router 下 beforeInteractive 由 app-bootstrap 依次创建 <script> 并等待加载
          完成后才水合，因此这里能拿到已就绪的 SDK；若写成原生 <script>，它会在 HTML
          解析阶段立即执行，此时 SDK 尚未加载，会抛
          ReferenceError: IframeErrorSync is not defined。
        */}
        <Script
          id="coder-iframe-error-sync-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.__errorBridge = window.IframeErrorSync && window.IframeErrorSync.child.create({ debug: false, reporters: 'auto' }).init();`,
          }}
        />
        <IframeSdkProvider>
          <UserProvider>{children}<Toaster /></UserProvider>
        </IframeSdkProvider>
      </body>
    </html>
  );
}
