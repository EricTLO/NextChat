"use client";
import { ApiPath, Alibaba, ALIBABA_BASE_URL } from "@/app/constant";
import {
  useAccessStore,
  useAppConfig,
  useChatStore,
  ChatMessageTool,
  usePluginStore,
} from "@/app/store";
import {
  preProcessImageContentForAlibabaDashScope,
  streamWithThink,
} from "@/app/utils/chat";
import {
  ChatOptions,
  getHeaders,
  LLMApi,
  LLMModel,
  SpeechOptions,
  MultimodalContent,
  MultimodalContentForAlibaba,
} from "../api";
import { getClientConfig } from "@/app/config/client";
import {
  getMessageTextContent,
  getMessageTextContentWithoutThinking,
  getTimeoutMSByModel,
  isVisionModel,
} from "@/app/utils";
import { fetch } from "@/app/utils/stream";

export interface OpenAIListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

interface RequestInput {
  messages: {
    role: "system" | "user" | "assistant";
    content: string | MultimodalContent[];
  }[];
}
interface RequestParam {
  result_format: string;
  incremental_output?: boolean;
  temperature: number;
  repetition_penalty?: number;
  top_p: number;
  max_tokens?: number;
  stream?:boolean
}
interface RequestPayload {
  model: string;
  input: any;
  messages: {
    role: "system" | "user" | "assistant";
    content: string | MultimodalContent[];
  }[];
  stream: boolean; // 添加 stream 属性
  parameters: RequestParam;
}

export class QwenApi implements LLMApi {
  path(path: string): string {
    const accessStore = useAccessStore.getState();

    let baseUrl = "";

    if (accessStore.useCustomConfig) {
      baseUrl = accessStore.alibabaUrl;
    }

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      baseUrl = isApp ? ALIBABA_BASE_URL : ApiPath.Alibaba;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.Alibaba)) {
      baseUrl = "https://" + baseUrl;
    }

    console.log("[Proxy Endpoint] ", baseUrl, path);

    return [baseUrl, path].join("/");
  }

  extractMessage(res: any) {
    return res?.output?.choices?.at(0)?.message?.content ?? "";
  }

  speech(options: SpeechOptions): Promise<ArrayBuffer> {
    throw new Error("Method not implemented.");
  }

  async chat(options: ChatOptions) {
    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
    };

    const visionModel = isVisionModel(options.config.model);

    const messages: ChatOptions["messages"] = [];
    for (const v of options.messages) {
      const content = (
        visionModel
          ? await preProcessImageContentForAlibabaDashScope(v.content)
          : v.role === "assistant"
          ? getMessageTextContentWithoutThinking(v)
          : getMessageTextContent(v)
      ) as any;

      messages.push({ role: v.role, content });
    }

    //const shouldStream = !!options.config.stream;

    const shouldStream = true;
    const requestPayload: RequestPayload = {
      model: modelConfig.model,  
      messages:messages,
      stream:true, // 移到这里
      input: {     
      },
      parameters: {
        result_format: "message",
        incremental_output: shouldStream,
        
        temperature: modelConfig.temperature,
        // max_tokens: modelConfig.max_tokens,
        top_p: modelConfig.top_p === 1 ? 0.99 : modelConfig.top_p, // qwen top_p is should be < 1
      },
    };

    const controller = new AbortController();
    options.onController?.(controller);

    try {
      const headers = {
        ...getHeaders(),
        //"X-DashScope-SSE": shouldStream ? "enable" : "disable",
        "X-DashScope-SSE": "enable",
      };

      const chatPath = this.path(Alibaba.ChatPath(modelConfig.model));
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: headers,
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        getTimeoutMSByModel(options.config.model),
      );

      if (shouldStream || true) {
        const [tools, funcs] = usePluginStore
          .getState()
          .getAsTools(
            useChatStore.getState().currentSession().mask?.plugin || [],
          );
        return streamWithThink(
          chatPath,
          requestPayload,
          headers,
          tools as any,
          funcs,
          controller,
          // parseSSE
          (text: string, runTools: ChatMessageTool[]) => {
             console.log("原始SSE数据:", text); // 可选：取消注释这行可以在浏览器控制台看到收到的每个数据块
            // console.log("parseSSE", text, runTools);
            //const json = JSON.parse(text);
            let json;
            

            //新的json检查---------------------------------------------------------------------
              try {
                // 处理可能的空行或非JSON标记（如果DashScope用的话）
                if (!text || text.trim() === "" || text.startsWith(":")) {
                   console.log("跳过空行或注释SSE行");
                   return { isThinking: false, content: "" };
                }
                // 如果DashScope用类似 [DONE] 的标记，你可能需要在这里加特定检查
                // 例如: if (text.includes("[DONE]")) return { isThinking: false, content: "", isDone: true };
            
                json = JSON.parse(text);
              } catch (error) {
                console.error("解析SSE JSON失败:", error, "原始文本是:", text);
                // 处理解析错误 - 可以考虑返回一个错误提示
                return { isThinking: false, content: "[解析响应错误]" };
              }
            
              // --- 修改这里的检查逻辑 ---
              // 现在我们直接检查 json.choices 是否是一个数组
              if (!json || !Array.isArray(json.choices)) {
                // 如果没有 json.choices，打印日志并检查是否是错误或结束块
                console.warn("收到的SSE块没有预期的 choices 结构 (直接在顶层):", json);
            
                if (json.code && json.message) {
                    console.error("DashScope API 流式传输错误:", json);
                    return { isThinking: false, content: `[API错误: ${json.message}]` };
                }
                // 你可以检查是否有 usage 字段来判断是否是结束块
                if (json.usage) {
                    console.log("收到包含 usage 的结束块:", json);
                    // 这里通常可以安全返回空，表示内容流结束
                    return { isThinking: false, content: "" };
                }
            
                // 其他未知结构，也返回空
                return { isThinking: false, content: "" };
              }
              // --- 检查结束 ---
              //新的json检查---------------------------------------------------------------------



            
            //const choices = json.output.choices as Array<{
            const choices = json.choices as Array<{
              message: {
                content: string | null | MultimodalContentForAlibaba[];
                tool_calls: ChatMessageTool[];
                reasoning_content: string | null;
              };
              delta?: { // 兼容 delta 结构
              content?: string | null;
              tool_calls?: ChatMessageTool[];
              reasoning_content?: string | null;
              
            };
              finish_reason?: string; // 结束原因
            }>;


             // （可选）增加一个 choices 是否为空数组的检查，更保险
            if (!choices?.length) {
               console.log("收到的SSE块 choices 数组为空:", json);
               return { isThinking: false, content: "" };
            }


            

            if (!choices?.length) return {
              console.log("收到的SSE块 choices 数组为空:", json);
              isThinking: false, content: "" };



            // --- 从 choices[0] 中提取信息 ---
              // 需要同时考虑 message 和 delta 两种可能的结构
              const firstChoice = choices[0];
              const message = firstChoice.message;
              const delta = firstChoice.delta;
            
              // 优先从 delta 获取，其次从 message 获取（流式响应通常用 delta）
              const tool_calls = delta?.tool_calls ?? message?.tool_calls;
              const reasoning = delta?.reasoning_content ?? message?.reasoning_content;
              let content = delta?.content ?? message?.content; // content 可能是字符串或数组






            
            //const tool_calls = choices[0]?.message?.tool_calls;
            if (tool_calls?.length > 0) {
              //const index = tool_calls[0]?.index;


               const toolCall = tool_calls[0]; // 假设每次只处理一个 tool call chunk
              const index = (toolCall as any).index; // DashScope 可能有 index



              
              const id = tool_calls[0]?.id;
              const args = tool_calls[0]?.function?.arguments;
              if (id) {
                runTools.push({
                  id,
                  type: tool_calls[0]?.type,
                  function: {
                    name: tool_calls[0]?.function?.name as string,
                    arguments: args,
                  },
                });
              } else {
                // @ts-ignore
                runTools[index]["function"]["arguments"] += args;
              }
            }

            const reasoning = choices[0]?.message?.reasoning_content;
            const content = choices[0]?.message?.content;

            // Skip if both content and reasoning_content are empty or null
            if (
              (!reasoning || reasoning.length === 0) &&
              (!content || content.length === 0) &&
              !tool_calls?.length // 也要考虑只有 tool calls 的情况
            ) {
              return {
                isThinking: false,
                content: "",
              };
            }

            // 检查 finish_reason，如果是 'tool_calls'，说明是工具调用结束，可能没有 content
            if (firstChoice.finish_reason === "tool_calls") {
               console.log("收到 tool_calls 结束标记");
               return { isThinking: false, content: "" };
            }

        

            if (reasoning && reasoning.length > 0) {
              return {
                isThinking: true,
                content: reasoning,
              };
            } else if (content && content.length > 0) {
              return {
                isThinking: false,
                content: Array.isArray(content)
                  ? content.map((item) => item.text).join(",")
                  : content,
              };
            }


            
            return {
              isThinking: false,
              content: "",
            };
          },
          // processToolMessage, include tool_calls message and tool call results
          (
            requestPayload: RequestPayload,
            toolCallMessage: any,
            toolCallResult: any[],
          ) => {
            requestPayload?.messages?.splice(
              requestPayload?.messages?.length,
              0,
              toolCallMessage,
              ...toolCallResult,
            );
          },
          options,
        );
      } else {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        const message = this.extractMessage(resJson);
        options.onFinish(message, res);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }
  async usage() {
    return {
      used: 0,
      total: 0,
    };
  }

  async models(): Promise<LLMModel[]> {
    return [];
  }
}
export { Alibaba };
