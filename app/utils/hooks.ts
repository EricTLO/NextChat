import { useMemo } from "react";
import { useAccessStore, useAppConfig } from "../store";
import { collectModelsWithDefaultModel } from "./model";
import { getServerSideConfig } from "../config/server";

export function useAllModels() {
  const accessStore = useAccessStore();
  const configStore = useAppConfig();
  
   // 安全获取服务器配置（避免客户端报错）
  const serverConfig = typeof window === 'undefined' ? 
    getServerSideConfig() : 
    { customModels: '', defaultModel: '' };
  
  
  const models = useMemo(() => {
    
          const combinedCustomModels = [
        serverConfig.customModels // 服务器配置优先
        //configStore.customModels,
        //accessStore.customModels
      ]
        .filter(Boolean) // 移除空值
        .join(",");

    
    return collectModelsWithDefaultModel(
      configStore.models,
      //[configStore.customModels, accessStore.customModels].join(","),
       // 直接使用服务器配置的customModels

      combinedCustomModels,
      accessStore.defaultModel,
    );
  }, [
    accessStore.customModels,
    serverConfig.customModels, // 依赖项改为serverConfig.customModels
    accessStore.defaultModel,
    configStore.customModels,
    configStore.models,
    //serverConfig.customModels, // 依赖项
    serverConfig.defaultModel
  ]);

  return models;
}
