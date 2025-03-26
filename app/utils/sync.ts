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
      // 1. 记录曾经存在但被删除的会话ID（需要持久化存储）
    const deletedIds = new Set(
      JSON.parse(localStorage.getItem('deletedChatIds') || '[]')
    );

    
     //merge sessions 合并会话
    const localSessions: Record<string, ChatSession> = {};
    localState.sessions.forEach((s) => (localSessions[s.id] = s));
  
    remoteState.sessions.forEach((remoteSession) => {
      // 跳过条件：空会话 或 被"删除"的会话（新增判断）
      if (remoteSession.messages.length === 0 || deletedIds.has(remoteSession.id)) {return;}
      
     const localSession = localSessions[remoteSession.id];
      if (!localSession) {
        // if remote session is new, just merge it
        localState.sessions.push(remoteSession);
      } else {
        // if both have the same session id, merge the messages
        const localMessageIds = new Set(localSession.messages.map((v) => v.id));
        remoteSession.messages.forEach((m) => {
          if (!localMessageIds.has(m.id)) {
            localSession.messages.push(m);
          }
        });

        // sort local messages with date field in asc order
        localSession.messages.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
      }
    });

    
    /*3. 更新删除记录（新增逻辑）
    const currentLocalIds = new Set(localState.sessions.map(s => s.id));
    remoteState.sessions.forEach(s => {
      if (!currentLocalIds.has(s.id) && s.messages.length > 0) {
        deletedIds.add(s.id); // 记录本地不存在但远程有的有效会话
      }
    });
    localStorage.setItem('deletedChatIds', JSON.stringify([...deletedIds]));*/ 

    
    // sort local sessions with date field in desc order
    localState.sessions.sort(
      (a, b) =>
        new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime(),
    );

    return localState;
  
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
/*
export function mergeWithUpdate<T extends { lastUpdateTime?: number }>(
  localState: T,
  remoteState: T,
) {
  const localUpdateTime = localState.lastUpdateTime ?? 0;
  // --- 修改点 14: 修复读取 remoteUpdateTime 的 bug ---
  const remoteUpdateTime = localState.lastUpdateTime ?? 1; // 默认值建议统一

  // 决定哪个是基础 (base)，哪个是源 (source)
  let baseState: T;
  let sourceState: T;

  if (localUpdateTime < remoteUpdateTime) {
      // 远程更新，以远程为基础，合并本地的进去
      baseState = { ...remoteState }; // 创建远程的拷贝作为基础
      sourceState = localState;
  } else {
      // 本地更新或一样新，以本地为基础，合并远程的进去
      baseState = { ...localState }; // 创建本地的拷贝作为基础
      sourceState = remoteState;
  }

  // 调用 merge 函数将 source 合并到 baseState 的拷贝中
  // 假设 merge(target, source) 修改 target
  // 警告：这里的 merge 仍然是之前的版本，有安全隐患且数组处理可能不符合预期！
  merge(baseState, sourceState);

  // 返回被合并和修改后的 baseState (它已经是拷贝了)
  return baseState;
}*/




export function mergeWithUpdate<T extends { lastUpdateTime?: number }>(
  localState: T,
  remoteState: T,
) {
  const localUpdateTime = localState.lastUpdateTime ?? 0;
  const remoteUpdateTime = remoteState.lastUpdateTime ?? 1;

  if (localUpdateTime > remoteUpdateTime) {
    merge(remoteState, localState);
    remoteState.lastUpdateTime = Date.now();
    console.log('1.remoteState.lastUpdateTime时间更新了，现在是merge(remoteState, localState)函数:', remoteState.lastUpdateTime);
    return { ...remoteState };
  } else {
    merge(localState, remoteState);
    localState.lastUpdateTime = Date.now();
    console.log('2.localState.lastUpdateTime时间更新了，现在是merge(localState, remoteState)函数:', localState.lastUpdateTime);
    return { ...localState };
  }
}
