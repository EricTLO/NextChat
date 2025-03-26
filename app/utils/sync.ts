import {
  ChatSession,
  useAccessStore,
  useAppConfig,
  useChatStore,
} from "../store";
import { useMaskStore } from "../store/mask";
import { usePromptStore } from "../store/prompt";
import { StoreKey } from "../constant";
import { merge } from "./merge";

type NonFunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];
type NonFunctionFields<T> = Pick<T, NonFunctionKeys<T>>;

//这个函数用于从对象中提取非函数字段。
export function getNonFunctionFileds<T extends object>(obj: T) {
  const ret: any = {};

  Object.entries(obj).map(([k, v]) => {
    if (typeof v !== "function") {
      ret[k] = v;
    }
  });

  return ret as NonFunctionFields<T>;
}

//这个类型用于从状态存储中获取非函数字段的状态。
export type GetStoreState<T> = T extends { getState: () => infer U }
  ? NonFunctionFields<U>
  : never;


//这些对象分别定义了不同状态存储的setter和getter方法。
const LocalStateSetters = {
  [StoreKey.Chat]: useChatStore.setState,
  [StoreKey.Access]: useAccessStore.setState,
  [StoreKey.Config]: useAppConfig.setState,
  [StoreKey.Mask]: useMaskStore.setState,
  [StoreKey.Prompt]: usePromptStore.setState,
} as const;

const LocalStateGetters = {
  [StoreKey.Chat]: () => getNonFunctionFileds(useChatStore.getState()),
  [StoreKey.Access]: () => getNonFunctionFileds(useAccessStore.getState()),
  [StoreKey.Config]: () => getNonFunctionFileds(useAppConfig.getState()),
  [StoreKey.Mask]: () => getNonFunctionFileds(useMaskStore.getState()),
  [StoreKey.Prompt]: () => getNonFunctionFileds(usePromptStore.getState()),
} as const;


//这个类型定义了应用程序的状态结构。
export type AppState = {
  [k in keyof typeof LocalStateGetters]: ReturnType<
    (typeof LocalStateGetters)[k]
  >;
};

//这些类型定义了合并函数的结构。
type Merger<T extends keyof AppState, U = AppState[T]> = (
  localState: U,
  remoteState: U,
) => U;

type StateMerger = {
  [K in keyof AppState]: Merger<K>;
};

// we merge remote state to local state
//合并策略，这个对象定义了不同状态存储的合并策略。
const MergeStates: StateMerger = {
  [StoreKey.Chat]: (localState, remoteState) => {
    // 我们将基于 localState 构建一个 Map，但值为 session 的浅拷贝
    const sessionMap = new Map<string, ChatSession>(
        localState.sessions.map(session => [session.id, { ...session }]) // 创建 session 的浅拷贝
    );

    
    /* merge sessions 合并会话
    const localSessions: Record<string, ChatSession> = {};
    localState.sessions.forEach((s) => (localSessions[s.id] = s));*/

    remoteState.sessions.forEach((remoteSession) => {
      // skip empty chats跳过空会话
      if (remoteSession.messages.length === 0) return;
      
      //-------------------------------------------新的同策略START----------------------------------------------------
      const remoteSessionCopy = { ...remoteSession }; // 创建远程会话的浅拷贝
      const existingSessionCopy = sessionMap.get(remoteSessionCopy.id);
      if (remoteSessionCopy.isDeleted) {
            // 处理远程删除: 如果本地存在，标记删除或直接从 Map 中移除
            if (existingSessionCopy) {
                 // 选项 A: 标记删除 (如果你需要保留记录)
                 existingSessionCopy.isDeleted = true;
                 // sessionMap.set(existingSessionCopy.id, existingSessionCopy); // 可选，因为对象已在 Map 中

                 // 选项 B: 直接移除 (如果不需要保留已删除的)
                 // sessionMap.delete(existingSessionCopy.id);
            }
            // 如果本地不存在且远程已删除，则忽略

        } else if (existingSessionCopy?.isDeleted) {
             // 处理本地已删除: 根据你的策略决定，是保留删除状态还是允许远程覆盖？
             // 示例：保留本地删除状态 (不做操作，因为 existingSessionCopy 已标记)
             // 或者，如果你想让未删除的远程覆盖本地删除:
             // existingSessionCopy.isDeleted = false; // 取消删除标记
             // 然后继续下面的合并逻辑... (当前代码是直接跳过合并)

             // --- 你的原始代码逻辑是让 remote 也标记删除 ---
             // remoteSessionCopy.isDeleted = true; // 在拷贝上标记，但这似乎没必要，因为最终是以 map 为准

        } else if (!existingSessionCopy) {
             // 本地没有，远程有且未删除: 添加远程会话的拷贝到 Map
             sessionMap.set(remoteSessionCopy.id, remoteSessionCopy);

        } else {
             // 本地和远程都存在，且都未标记删除: 合并消息
             const localMessages = existingSessionCopy.messages || [];
             const remoteMessages = remoteSessionCopy.messages || [];
             const localMessageIds = new Set(localMessages.map((v) => v.id));

             // --- 修改点 2: 创建新的消息数组 ---
             const mergedMessages = [
                 ...localMessages, // 先包含所有本地消息
                 // 添加远程有但本地没有的消息
                 ...remoteMessages.filter((m) => !localMessageIds.has(m.id))
             ];

             // --- 修改点 3: 在新数组上排序 ---
             // 注意：sort 会修改原数组，但 mergedMessages 已经是新创建的了
             mergedMessages.sort(
                 (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
             );

             // --- 修改点 4: 更新 Map 中的 session 拷贝 ---
             // 使用新的消息数组更新 existingSessionCopy
             existingSessionCopy.messages = mergedMessages;
             // 可以考虑更新 lastUpdate 时间戳等
             existingSessionCopy.lastUpdate = remoteSessionCopy.lastUpdate > existingSessionCopy.lastUpdate
                                              ? remoteSessionCopy.lastUpdate
                                              : existingSessionCopy.lastUpdate;

            // sessionMap.set(existingSessionCopy.id, existingSessionCopy); // 可选，因为对象已在 Map 中
        }
        //-------------------------------------------新的同策略END----------------------------------------------------


      
      /*
      const localSession = localSessions[remoteSession.id];
       if (remoteSession.isDeleted) {        
      
      }else if (localSession?.isDeleted) {
         remoteSession.isDeleted = true;
        
      }else if (!localSession && !remoteSession.isDeleted) {
         localState.sessions.push(remoteSession);
      }else {
          // if both have the same session id, merge the messages
         //如果本地和远端都有消息，合并消息内容
        const localMessageIds = new Set(localSession.messages.map((v) => v.id));
        remoteSession.messages.forEach((m) => {
          if (!localMessageIds.has(m.id)) {
            localSession.messages.push(m);
          }*/

      
        //});
           // --- 修改点 5: 从 Map 生成最终的 sessions 数组 ---
        let finalSessions = Array.from(sessionMap.values());
        // --- 修改点 6: 在新数组上过滤 ---
        finalSessions = finalSessions.filter((s) => !s.isDeleted); // 移除标记为删除的会话
        // --- 修改点 7: 在新数组上排序 ---
        // 注意：sort 会修改原数组，但 finalSessions 已经是上一步 filter 产生的新数组了
        finalSessions.sort(
          (a, b) =>
            new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime(),
        );
        // --- 修改点 8: 返回包含新 sessions 数组的新 state 对象 ---
    return {
      ...localState, // 包含 localState 的其他属性（如果有的话）
      sessions: finalSessions, // 使用最终处理过的新数组
    };
    
        /* sort local messages with date field in asc order
        localSession.messages.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );*/

         /* 移除标记为删除的会话，可行性?
        localState.sessions = localState.sessions.filter((s) => !s.isDeleted);*/
      };
    //});

    /* sort local sessions with date field in desc order
    localState.sessions.sort(
      (a, b) =>
        new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime(),
    );

    return localState;*/
    




  },
  [StoreKey.Prompt]: (localState, remoteState) => {
    localState.prompts = {
      ...remoteState.prompts,
      ...localState.prompts,
    };
    return localState;
  },
  [StoreKey.Mask]: (localState, remoteState) => {
    localState.masks = {
      ...remoteState.masks,
      ...localState.masks,
    };
    return localState;
  },
  [StoreKey.Config]: mergeWithUpdate<AppState[StoreKey.Config]>,
  [StoreKey.Access]: mergeWithUpdate<AppState[StoreKey.Access]>,
};

export function getLocalAppState() {
  const appState = Object.fromEntries(
    Object.entries(LocalStateGetters).map(([key, getter]) => {
      return [key, getter()];
    }),
  ) as AppState;

  return appState;
}

export function setLocalAppState(appState: AppState) {
  Object.entries(LocalStateSetters).forEach(([key, setter]) => {
    setter(appState[key as keyof AppState]);
  });
}
//NEW的
export function mergeAppState(localState: AppState, remoteState: AppState): AppState { // 显式返回类型
   // --- 修改点 13: 构建新的 AppState 对象 ---
   const mergedAppState: Partial<AppState> = {}; // 使用 Partial 允许逐步构建

   Object.keys(localState).forEach(<T extends keyof AppState>(k: string) => {
    const key = k as T;
    const localStoreState = localState[key];
    const remoteStoreState = remoteState[key];

    // 调用合并函数，获取合并后的新状态部分
    const mergedStoreState = MergeStates[key](localStoreState, remoteStoreState);

    // 将合并后的新状态部分放入新的 AppState 对象中
    mergedAppState[key] = mergedStoreState;
  });
  // 返回构建完成的全新 AppState 对象
  return mergedAppState as AppState; // 类型断言回 AppState

/*old
export function mergeAppState(localState: AppState, remoteState: AppState) {
  Object.keys(localState).forEach(<T extends keyof AppState>(k: string) => {
    const key = k as T;
    const localStoreState = localState[key];
    const remoteStoreState = remoteState[key];
    MergeStates[key](localStoreState, remoteStoreState);
  });

  return localState;*/
}

/**
 * Merge state with `lastUpdateTime`, older state will be override
 */
export function mergeWithUpdate<T extends { lastUpdateTime?: number }>(
  localState: T,
  remoteState: T,
) {
  const localUpdateTime = localState.lastUpdateTime ?? 0;
  const remoteUpdateTime = remoteState.lastUpdateTime ?? 0;

  if (localUpdateTime < remoteUpdateTime) {
    merge(remoteState, localState);
    return { ...remoteState };
  } else {
    merge(localState, remoteState);
    return { ...localState };
  }
}
