'use client';

import { useEffect } from 'react';

import '@/sdk/bind-error-sync';
import { useIframeRouteSync } from '@/sdk/bind-route-sync';

declare global {
  interface Window {
    IframeErrorSync?: {
      child: {
        create: (options?: { debug?: boolean; reporters?: string }) => {
          init: () => unknown;
        };
      };
    };
    IframeElementPicker?: {
      child: {
        create: (options?: {
          debug?: boolean;
          computedStyleProps?: string[];
        }) => { init: () => unknown; destroy: () => void };
      };
    };
  }
}

export function IframeSdkProvider({ children }: { children: React.ReactNode }) {
  useIframeRouteSync();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // 初始化 iframe-element-picker child；通过 CDN 加载，可能未就绪。
    if (window.IframeElementPicker) {
      window.IframeElementPicker.child.create({ debug: false }).init();
    }
  }, []);

  return <>{children}</>;
}
