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
 /*async set(key: string, value: string | Blob) {
  const CHUNK_SIZE = 25600 * 1024;
  const MAX_RETRIES = 3;
  const RETRY_DELAY_BASE = 1000; // 初始重试延迟1秒

  // 初始化上传会话
  const startTime = Date.now();
   let start = 0;
  let totalSize = 0;
  console.debug(`[WebDav] 开始上传任务:
  Key: ${key}

  数据大小: ${typeof value === 'string' ? value.length : value.size} bytes
  分块大小: ${CHUNK_SIZE} bytes
  最大重试次数: ${MAX_RETRIES}
  开始时间: ${new Date(startTime).toISOString()}`);

  try {
    // 准备数据
    const buffer = typeof value === 'string' 
      ? new TextEncoder().encode(value)
      : await value.arrayBuffer();
    totalSize = buffer.byteLength;
    let uploadedChunks = 0;

    console.debug(`[WebDav] 数据转换完成，实际字节长度: ${totalSize} bytes`);

    while (start < totalSize) {
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunk = buffer.slice(start, end);
      const contentRange = `bytes ${start}-${end - 1}/${totalSize}`;
      const chunkNumber = uploadedChunks + 1;
      const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
      
      console.debug(`[WebDav] 准备上传分块 ${chunkNumber}/${totalChunks}:
      Content-Range: ${contentRange}
      分块大小: ${end - start} bytes
      进度: ${((start / totalSize) * 100).toFixed(1)}%`);

      let attempt = 1;
      let success = false;

      while (attempt <= MAX_RETRIES && !success) {
        try {
          console.debug(`[WebDav] 尝试上传 (尝试次数 ${attempt}/${MAX_RETRIES})...`);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);
          
          const res = await fetch(this.path(key, proxyUrl), {
            method: "PUT",
            headers: {
              ...this.headers(),
              "Content-Range": contentRange              
            },
            body: chunk,
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);

          console.debug(`[WebDav] 收到服务器响应:
          HTTP 状态码: ${res.status} (${res.statusText})
          响应头: ${JSON.stringify([...res.headers])}
          请求ID: ${res.headers.get('x-request-id') || '无'}`);

          // 读取响应体用于调试（注意可能消耗响应）
          const responseBody = await res.text();
          console.debug(`响应体内容: ${responseBody.slice(0, 200)}...`);

          if (!res.ok) {
            console.warn(`[WebDav] 分块上传失败:
            尝试次数: ${attempt}
            错误码: ${res.status}
            响应内容: ${responseBody}`);
            
            if (res.status === 416) {
              console.error('Content-Range 无效，终止上传');
              return false;
            }
            
            await new Promise(r => setTimeout(r, RETRY_DELAY_BASE * Math.pow(2, attempt-1)));
            attempt++;
            continue;
          }

          success = true;
          uploadedChunks++;
          start = end;
          
          console.debug(`[WebDav] 分块上传成功! 已上传 ${uploadedChunks}/${totalChunks} 块`);

        } catch (e: any) { //或者catch (e: unknown){
  const error = e as Error; // 类型断言
  console.error(`[WebDav] 分块上传异常:
      错误类型: ${error.name}
      错误信息: ${error.message}
      堆栈追踪: ${error.stack}`);

          
          if (attempt >= MAX_RETRIES) {
            throw new Error(`分块上传失败，已达最大重试次数: ${MAX_RETRIES}`);
          }
          
          await new Promise(r => setTimeout(r, RETRY_DELAY_BASE * Math.pow(2, attempt-1)));
          attempt++;
        }
      }

      if (!success) {
        throw new Error(`分块上传失败，无法继续`);
      }
    }

    // 最终校验
    console.debug('[WebDav] 开始最终完整性校验...');
    const verifyRes = await fetch(this.path(key, proxyUrl), { method: 'HEAD' });
    const serverSize = parseInt(verifyRes.headers.get('Content-Length') || '0');
    
    console.debug(`[WebDav] 服务器文件大小: ${serverSize} bytes | 本地大小: ${totalSize} bytes`);
    
    if (serverSize !== totalSize) {
      throw new Error(`文件大小不一致 (本地: ${totalSize}, 服务器: ${serverSize})`);
    }

    console.info(`[WebDav] 上传成功!
    总耗时: ${((Date.now() - startTime)/1000).toFixed(1)}秒
    平均速度: ${(totalSize / ((Date.now() - startTime)/1000)).toFixed(1)} B/s`);

    return true;

  } catch (e: any) {
    const error = e as Error; // 类型断言
    console.error(`[WebDav] 上传任务失败!
    错误信息: ${error.message}
    失败位置: ${start !== undefined ? `已上传 ${start}/${totalSize} bytes` : '初始化阶段'}
    失败位置: ${start > 0 ? `已上传 ${start}/${totalSize} bytes` : '初始化阶段'}
    总耗时: ${((Date.now() - startTime)/1000).toFixed(1)}秒`);
    
    // 可选：清理未完成的上传
    // await fetch(this.path(key, proxyUrl), { method: 'DELETE' });
    
    return false;
  }
},*/
/*-------------------------------------------------------------以上是新的切割文件的方法END-------------------------------------------------------------*/

    //以下是旧的方法
    async set(key: string, value: string) {
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
