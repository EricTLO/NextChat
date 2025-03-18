import { STORAGE_KEY } from "@/app/constant";
import { SyncStore } from "@/app/store/sync";

export type WebDAVConfig = SyncStore["webdav"];
export type WebDavClient = ReturnType<typeof createWebDavClient>;

export function createWebDavClient(store: SyncStore) {
  const folder = STORAGE_KEY;
  const fileName = `${folder}/backup.json`;
  const config = store.webdav;
  const proxyUrl =
    store.useProxy && store.proxyUrl.length > 0 ? store.proxyUrl : undefined;

  return {
    async check() {
      try {
        const res = await fetch(this.path(folder, proxyUrl, "MKCOL"), {
          method: "GET",
          headers: this.headers(),
        });
        const success = [201, 200, 404, 405, 301, 302, 307, 308].includes(
          res.status,
        );
        console.log(
          `[WebDav] check ${success ? "success" : "failed"}, ${res.status} ${
            res.statusText
          }`,
        );
        return success;
      } catch (e) {
        console.error("[WebDav] failed to check", e);
      }

      return false;
    },

    async get(key: string) {
      const res = await fetch(this.path(fileName, proxyUrl), {
        method: "GET",
        headers: this.headers(),
      });

      console.log("[WebDav] get key = ", key, res.status, res.statusText);

      if (404 == res.status) {
        return "";
      }

      return await res.text();
    },

/*-------------------------------------------------------------以下是新的切割文件的方法START-------------------------------------------------------------*/
  async set(key: string, value: string) {
  const chunkSize = 1024 * 4024; // 256KB 的块大小 (可以根据你的情况调整)
  const totalSize = value.length;
  let start = 0;

  while (start < totalSize) {
    const end = Math.min(start + chunkSize, totalSize);
    const chunk = value.substring(start, end);
    const contentRange = `bytes ${start}-${end - 1}/${totalSize}`;

    try {
      const res = await fetch(this.path(fileName, proxyUrl), {
        method: "PUT",
        headers: {
          ...this.headers(),
          "Content-Range": contentRange, // 添加 Content-Range 头部
        },
        body: chunk,
      });

      console.log(
        `[WebDav] set chunk ${start}-${end - 1}, status = `,
        res.status,
        res.statusText,
      );

      if (!res.ok) {
        console.error(
          `[WebDav] set chunk ${start}-${end - 1} 处理上传失败的情况failed:`,
          res.status,
          res.statusText,
        );
        // 处理上传失败的情况 (例如，重试，通知用户)
        return false; // 或者抛出一个错误
      }
    } catch (e) {
      console.error(`[WebDav] set chunk ${start}-${end - 1} 抛出一个错误error:`, e);
      return false; // 或者抛出一个错误
    }

    start = end;
  }

  console.log("[WebDav] set key = ", key, " complete上传成功");
  return true; // 上传成功
},
/*-------------------------------------------------------------以上是新的切割文件的方法END-------------------------------------------------------------*/

    //以下是旧的方法
    /*async set(key: string, value: string) {
      const res = await fetch(this.path(fileName, proxyUrl), {
        method: "PUT",
        headers: this.headers(),
        body: value,
      });

      console.log("[WebDav] set key = ", key, res.status, res.statusText);
    },*/

    headers() {
      const auth = btoa(config.username + ":" + config.password);

      return {
        authorization: `Basic ${auth}`,
      };
    },
    path(path: string, proxyUrl: string = "", proxyMethod: string = "") {
      if (path.startsWith("/")) {
        path = path.slice(1);
      }

      if (proxyUrl.endsWith("/")) {
        proxyUrl = proxyUrl.slice(0, -1);
      }

      let url;
      const pathPrefix = "/api/webdav/";

      try {
        let u = new URL(proxyUrl + pathPrefix + path);
        // add query params
        u.searchParams.append("endpoint", config.endpoint);
        proxyMethod && u.searchParams.append("proxy_method", proxyMethod);
        url = u.toString();
      } catch (e) {
        url = pathPrefix + path + "?endpoint=" + config.endpoint;
        if (proxyMethod) {
          url += "&proxy_method=" + proxyMethod;
        }
      }

      return url;
    },
  };
}
