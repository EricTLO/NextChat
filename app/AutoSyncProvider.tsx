// components/AutoSyncProvider.tsx
"use client";
import { useAutoSync } from './config/useAutoSync'; 
import React from 'react';

export function AutoSyncProvider({ children }: { children: React.ReactNode }) {
    useAutoSync(); // 客户端组件中调用 Hook
    return <>{children}</>;
}
