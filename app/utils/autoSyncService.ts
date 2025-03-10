/*// utils/autoSyncService.ts
import { useSyncStore } from "./store/sync"; // 确保路径正确
import { useAppConfig } from "./store";     // 确保路径正确
import { showToast } from "./components/ui-lib"; // 确保路径正确
import Locale from "./locales";             // 确保路径正确

let syncIntervalId: number | null = null; // 保存定时器 ID

export function startAutoSync() {
    if (syncIntervalId) {
        return; // 如果定时器已启动，则直接返回，避免重复启动
    }

    const syncStore = useSyncStore.getState(); // **获取 store 实例，而不是 Hook**
    const appConfigStore = useAppConfig.getState(); // **获取 config store 实例**

    const syncInterval = 5 * 60 * 1000; // 5 分钟

    const syncData = async () => {
        if (!appConfigStore.autoSyncEnabled) { // 检查是否启用自动同步
            return; // 如果未启用，则不进行同步
        }

        try {
            await syncStore.sync();
            showToast(Locale.Settings.Sync.AutoSync.Success); // 显示成功提示 (可选)
        } catch (e) {
            showToast(Locale.Settings.Sync.AutoSync.Fail);    // 显示失败提示 (可选)
            console.error("[Auto Sync (Global Timer)]", e);
        }
    };

    syncData(); // 立即执行一次同步

    syncIntervalId = setInterval(syncData, syncInterval); // 启动定时器
    console.log("[AutoSyncService] Global timer started."); // 添加日志
}

export function stopAutoSync() {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
        console.log("[AutoSyncService] Global timer stopped."); // 添加日志
    }
}*/
