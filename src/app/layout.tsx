import type { Metadata } from 'next';
import Script from 'next/script';

import { IframeSdkProvider } from '@/components/iframe-sdk-provider';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '新应用 | 超星诺亚编程平台（NoahCoder）',
    template: '%s | 超星诺亚编程平台（NoahCoder）',
  },
  description:
    '超星诺亚编程平台（NoahCoder）是一款一站式云端 Vibe Coding 开发平台。通过对话轻松构建智能体、工作流和网站，实现从创意到上线的无缝衔接。',
  keywords: [
    '超星诺亚编程平台（NoahCoder）',
    'NoahCoder',
    'Vibe Coding',
    'AI 编程',
    '智能体搭建',
    '工作流搭建',
    '网站搭建',
    '网站部署',
    '全栈开发',
    'AI 工程师',
  ],
  authors: [{ name: 'NoahCoder Team', url: '' }],
  generator: 'NoahCoder',
  openGraph: {
    title: '超星诺亚编程平台（NoahCoder） | 你的 AI 工程师已就位',
    description:
      '我正在使用超星诺亚编程平台（NoahCoder） Vibe Coding，让创意瞬间上线。告别拖拽，拥抱心流。',
    url: '',
    siteName: '超星诺亚编程平台（NoahCoder）',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {/**
          iframe-route-sync：子页面路由 ↔ 父页面地址双向同步
          iframe-error-sync：子页面 dev 错误上报到父页面调试面板
          iframe-element-picker：子页面元素选取能力
          beforeInteractive 策略确保应用代码执行前 SDK 已就绪。
        */}
        <Script
          src="https://robot.chaoxing.com/coder-sdk/iframe-route-sync/child.umd.js?v=1792389631323"
          strategy="beforeInteractive"
        />
        <Script
          src="https://robot.chaoxing.com/coder-sdk/iframe-error-sync/child.umd.js?v=1792389631323"
          strategy="beforeInteractive"
        />
        <Script
          src="https://robot.chaoxing.com/coder-sdk/iframe-element-picker/child.umd.js?v=1792389631323"
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
        <IframeSdkProvider>{children}</IframeSdkProvider>
      </body>
    </html>
  );
}
