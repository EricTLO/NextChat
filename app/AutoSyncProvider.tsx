// components/AutoSyncProvider.tsx
"use client";
import { useAutoSync } from './config/useAutoSync';
import React, { useEffect } from 'react';

export function AutoSyncProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const intervalId = setInterval(() => {
      useAutoSync(); // 每 5 分钟执行一次 useAutoSync
    }, 5 * 60 * 1000); // 5 分钟 * 60 秒 * 1000 毫秒

    // 组件卸载时清除 interval
    return () => clearInterval(intervalId);
  }, []); // 空依赖数组，确保只在组件挂载时设置 interval

  return <>{children}</>;
}
