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
    //这是新的方法
    async check() {
    try {
      const res = await fetch(this.path(folder, proxyUrl, "PROPFIND"), {
        method: "PROPFIND", // 使用 PROPFIND 方法
        headers: this.headers(),
      });  
  
      const success = [207, 200, 401, 403].includes(res.status); // 常见的 WebDAV 成功状态码和认证状态码
      console.log(
        `[WebDav] check ${success ? "success" : "failed"}, ${res.status} ${
          res.statusText
        }`,
      );
      return success;
    } catch (e) {
      console.error("[WebDav] 检查失败，无法连接成功", e);
    }


  return false;
},
    
    /*
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
    },*///这是原来的的方法

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

    async set(key: string, value: string) {

     const fileSize = new Blob([value]).size;
      if (fileSize > 500 * 1024 * 1024) { // 500MB
        console.error("文件大小超过500MB，无法上传");
        return;
      }

      const res = await fetch(this.path(fileName, proxyUrl), {
        method: "PUT",
        headers: this.headers(),
        body: value,
      });

      console.log("[WebDav] set key = ", key, res.status, res.statusText);
    },

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
