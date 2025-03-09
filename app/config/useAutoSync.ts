// hooks/useAutoSync.ts
import { useEffect } from 'react';
import { useSyncStore } from "../store/sync"; // 假设你的 syncStore 在这里
import { useAppConfig } from "../store"; // 假设你的 config store 在这里
import { showToast } from "../components/ui-lib"; // 假设你的 toast 组件在这里
import Locale from "../locales"; // 假设你的 Locale 文件在这里

export function useAutoSync() {
    const syncStore = useSyncStore();
    const config = useAppConfig();
    const autoSyncEnabled = config.autoSyncEnabled;

    useEffect(() => {
        let intervalId: number | null = null;

        if (autoSyncEnabled) {
            const syncInterval = 5 * 60 * 1000; // 5 分钟

            const syncData = async () => {
                try {
                    await syncStore.sync();
                    showToast(Locale.Settings.Sync.AutoSync.Success); //  显示成功提示 (可选)
                } catch (e) {
                    showToast(Locale.Settings.Sync.AutoSync.Fail);    //  显示失败提示 (可选)
                    console.error("[Auto Sync]", e);
                }
            };

            syncData(); // 立即执行一次同步
            intervalId = setInterval(syncData, syncInterval) as unknown as number;
        }

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [autoSyncEnabled, syncStore]);
}
