// components/AutoSyncProvider.tsx
"use client";
import { useAutoSync } from './config/useAutoSync';
import React, { useEffect, useCallback } from 'react';

export function AutoSyncProvider({ children }: { children: React.ReactNode }) {

  // 使用 useCallback 创建一个记忆化的函数
  const sync = useCallback(() => {
    useAutoSync(); // 调用 useAutoSync Hook
  }, [useAutoSync]); // 依赖项，如果 useAutoSync 发生变化，sync 函数也会重新创建

  useEffect(() => {
    const intervalId = setInterval(() => {
      sync(); // 每 5 分钟执行一次 sync 函数
    }, 5 * 60 * 1000); // 5 分钟 * 60 秒 * 1000 毫秒

    // 组件卸载时清除 interval
    return () => clearInterval(intervalId);
  }, [sync]); // 依赖项，如果 sync 函数发生变化，useEffect 也会重新执行

  return <>{children}</>;
}
