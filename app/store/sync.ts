import zlib from 'zlib';
import { getClientConfig } from "../config/client";
import { ApiPath, STORAGE_KEY, StoreKey } from "../constant";
import { createPersistStore } from "../utils/store";
import {
  AppState,
  getLocalAppState,
  GetStoreState,
  mergeAppState,
  setLocalAppState,
} from "../utils/sync";
import { downloadAs, readFromFile } from "../utils";
import { showToast } from "../components/ui-lib";
import Locale from "../locales";
import { createSyncClient, ProviderType } from "../utils/cloud";

export interface WebDavConfig {
  server: string;
  username: string;
  password: string;
}

const isApp = !!getClientConfig()?.isApp;
export type SyncStore = GetStoreState<typeof useSyncStore>;

const DEFAULT_SYNC_STATE = {
  provider: ProviderType.WebDAV,
  useProxy: true,
  proxyUrl: ApiPath.Cors as string,

  webdav: {
    endpoint: "",
    username: "",
    password: "",
  },

  upstash: {
    endpoint: "",
    username: STORAGE_KEY,
    apiKey: "",
  },

  lastSyncTime: 0,
  lastProvider: "",
};


// 压缩函数
function compress(data: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gzip(data, (err, buffer) => {
      if (err) {
        reject(err);
      } else {
        resolve(buffer);
      }
    });
  });
}

// 解压函数
function decompress(data: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(data, (err, buffer) => {
      if (err) {
        reject(err);
      } else {
        resolve(buffer.toString());
      }
    });
  });
}


export const useSyncStore = createPersistStore(
  DEFAULT_SYNC_STATE,
  (set, get) => ({
    cloudSync() {
      const config = get()[get().provider];
      return Object.values(config).every((c) => c.toString().length > 0);
    },

    markSyncTime() {
      set({ lastSyncTime: Date.now(), lastProvider: get().provider });
    },

    export() {
      const state = getLocalAppState();
      const datePart = isApp
        ? `${new Date().toLocaleDateString().replace(/\//g, "_")} ${new Date()
            .toLocaleTimeString()
            .replace(/:/g, "_")}`
        : new Date().toLocaleString();

      const fileName = `Backup-${datePart}.json`;
      downloadAs(JSON.stringify(state), fileName);
    },

    async import() {
      const rawContent = await readFromFile();

      try {
        const remoteState = JSON.parse(rawContent) as AppState;
        const localState = getLocalAppState();
        mergeAppState(localState, remoteState);
        setLocalAppState(localState);
        location.reload();
      } catch (e) {
        console.error("[Import]", e);
        showToast(Locale.Settings.Sync.ImportFailed);
      }
    },

    getClient() {
      const provider = get().provider;
      const client = createSyncClient(provider, get());
      return client;
    },
    
    //---------------------------------------------新的sync方案---START------------------------------------------

    async sync() {
  const localState = getLocalAppState();
  const provider = get().provider;
  const config = get()[provider];
  const client = this.getClient();

  try {
    // 1. 上传本地状态到云端
    try {
      console.log("[Sync] 开始上传本地状态到云端...");
      console.log("[Sync] localState的内容", localState); // 添加这行代码！
      const jsonString = JSON.stringify(localState); // 转换为 JSON 字符串
      const compressedData = await compress(jsonString); // 压缩数据
      await client.set(config.username, compressedData.toString('latin1')); // 上传压缩后的数据 (以latin1编码)
      console.log("[Sync] 成功上传本地状态到云端.");
    } catch (uploadError) {
      console.error("[Sync] 上传本地状态到云端失败，用户名密码不对或者无法连接:", uploadError);
      
      throw uploadError; // 抛出错误，阻止后续操作
    }

    // 2. 添加延迟，确保服务器完成文件组合 (例如 1 秒)
    console.log("[Sync] 等待 1 秒...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("[Sync] 1 秒等待完成.");

    // 3. 从云端获取远程状态
    console.log("[Sync] 开始从云端获取远程状态...");
    let remoteState = await client.get(config.username);
    console.log("[Sync] 成功从云端获取远程状态.");

    if (!remoteState || remoteState === "") {
      console.log("[Sync] Remote state is empty.");
      return;
    } else {
      console.log("[Sync] 远程状态不为空，尝试解析 JSON...");
      console.log("Raw remoteState:", remoteState); // 添加这行代码
       try {
          const decompressedValue = await decompress(Buffer.from(remoteState, 'latin1')); // 解压数据 (从latin1解码)
          console.log("[Sync] 云端下载解压缩回来之后localState的内容-粗版", decompressedValue); // 添加这行代码！
          const parsedRemoteState = JSON.parse(decompressedValue) as AppState; // 解析 JSON
           console.log("[Sync] 云端下载解压缩回来之后localState的内容-细版", parsedRemoteState); // 添加这行代码！
          console.log("[Sync] 成功解析 JSON.");
          mergeAppState(localState, parsedRemoteState);
          setLocalAppState(localState);
      } catch (parseError) {
          console.error("[Sync] Failed to parse remote state:解析失败了！！！！解析失败了！！！！解析失败了！！！！解析失败了！！！！", parseError);
      }
    }
  } catch (e) {
      console.log("[Sync] sync failed", e);
      
  }

  this.markSyncTime();
},
    //---------------------------------------------新的sync方案--END-------------------------------------------
    
    /*以下是旧的方案
    async sync() {
      const localState = getLocalAppState();
      const provider = get().provider;
      const config = get()[provider];
      const client = this.getClient();

      try {
        const remoteState = await client.get(config.username);
        if (!remoteState || remoteState === "") {
          await client.set(config.username, JSON.stringify(localState));
          console.log(
            "[Sync] Remote state is empty, using local state instead.",
          );
          return;
        } else {
          const parsedRemoteState = JSON.parse(
            await client.get(config.username),
          ) as AppState;
          mergeAppState(localState, parsedRemoteState);
          setLocalAppState(localState);
        }
      } catch (e) {
        console.log("[Sync] failed to get remote state", e);
        throw e;
      }

      await client.set(config.username, JSON.stringify(localState));

      this.markSyncTime();
    },*/

    async check() {
      const client = this.getClient();
      return await client.check();
    },
  }),
  {
    name: StoreKey.Sync,
    version: 1.2,

    migrate(persistedState, version) {
      const newState = persistedState as typeof DEFAULT_SYNC_STATE;

      if (version < 1.1) {
        newState.upstash.username = STORAGE_KEY;
      }

      if (version < 1.2) {
        if (
          (persistedState as typeof DEFAULT_SYNC_STATE).proxyUrl ===
          "/api/cors/"
        ) {
          newState.proxyUrl = "";
        }
      }

      return newState as any;
    },
  },
);
