/**
 * iframe-error-sync 子页面 Next.js 接入。
 * import 即执行，依赖 layout 中初始化的 window.__errorBridge。
 *
 * 说明：
 * - iframe-error-sync 的 child.create(...).init() 会在父页面初始化时自动挂载错误捕获器。
 * - Next.js 没有 Vite 的 import.meta.hot 事件，因此这里不再额外发送 HMR 开始/结束通知。
 * - 父页面如需感知 HMR，可结合 bind-route-sync 的路由同步能力。
 */
(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const bridge = window.__errorBridge;

  if (!bridge) {
    return;
  }

  // 标记已绑定；实际错误捕获由 iframe-error-sync 在 layout 初始化时接管。
  console.log('[iframe-error-sync] Next.js child bound.');
})();
