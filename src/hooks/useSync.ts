import { nanoid } from "nanoid";
import { useEffect, useRef, useState } from "react";
import { globalStore } from "@/stores/global";
import type { DatabaseSchemaHistory } from "@/types/database";
import { setPendingLatestSource } from "@/utils/latestSource";
import { join } from "@/utils/path";

interface SyncMessage {
  type:
    | "ADD"
    | "UPDATE"
    | "DELETE"
    | "SYNC_ALL"
    | "SYNC_REQUEST"
    | "PUSH_LATEST"
    | "LATEST_UPDATE";
  payload?: any;
  data?: any[];
}

interface LatestApiResponse {
  success: boolean;
  data: any | null;
}

interface FetchLatestResult {
  source: "connect" | "poll" | "manual";
  ok: boolean;
  applied: boolean;
  reason:
    | "realtime-disabled"
    | "missing-credentials"
    | "http-error"
    | "request-exception"
    | "no-data"
    | "applied"
    | "ignored"
    | "ignored-self"
    | "ignored-stale"
    | "ignored-unsupported";
  status?: number;
  error?: string;
}

interface ApplyLatestResult {
  applied: boolean;
  reason: "applied" | "ignored-self" | "ignored-stale" | "ignored-unsupported";
}

const AUTO_LATEST_MAX_AGE_MS = 5000;
type LatestApplySource = "realtime" | "connect" | "poll" | "manual";

// 全局 WebSocket 引用
let globalWs: WebSocket | null = null;
let globalIsConnected = false;
const CLIENT_ID_STORAGE_KEY = "pastex_client_id";
const DEVICE_NAME_STORAGE_KEY = "pastex_device_name";

const getOrCreateClientId = () => {
  let clientId = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);
  }
  return clientId;
};

const getOrCreateDeviceName = async () => {
  const storedName = localStorage.getItem(DEVICE_NAME_STORAGE_KEY);
  if (storedName) {
    return storedName;
  }

  try {
    const { hostname } = await import("@tauri-apps/plugin-os");
    const currentHostname = await hostname();

    if (currentHostname) {
      localStorage.setItem(DEVICE_NAME_STORAGE_KEY, currentHostname);
      return currentHostname;
    }
  } catch (_error) {}

  const fallbackName = `Device-${getOrCreateClientId().substring(0, 6)}`;
  localStorage.setItem(DEVICE_NAME_STORAGE_KEY, fallbackName);
  return fallbackName;
};

// 全局发送消息函数
export const sendSyncMessage = (message: SyncMessage) => {
  if (globalWs && globalWs.readyState === WebSocket.OPEN && globalIsConnected) {
    globalWs.send(JSON.stringify(message));
    return true;
  } else {
    return false;
  }
};

// 收集客户端信息
const collectClientInfo = async () => {
  try {
    // 动态导入 Tauri API
    const {
      arch,
      platform,
      version,
      type: osType,
    } = await import("@tauri-apps/plugin-os");

    const { getVersion } = await import("@tauri-apps/api/app");

    // 获取或生成唯一的客户端 ID
    const clientId = getOrCreateClientId();

    return {
      appVersion: await getVersion(),
      arch: arch(),
      hostname: await getOrCreateDeviceName(),
      id: clientId,
      language: navigator.language,
      osType: osType(),
      osVersion: version(),
      platform: platform(),
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
    };
  } catch (_error) {
    const clientId = getOrCreateClientId();

    return {
      appVersion: "Unknown",
      arch: "Unknown",
      hostname: `Device-${clientId.substring(0, 6)}`,
      id: clientId,
      language: navigator.language,
      osType: "Unknown",
      osVersion: "Unknown",
      platform: "Unknown",
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
    };
  }
};

// 将图片文件转换为 base64
const imageToBase64 = async (imagePath: string): Promise<string | null> => {
  try {
    const { exists, readFile } = await import("@tauri-apps/plugin-fs");
    const { getDefaultSaveImagePath } = await import(
      "tauri-plugin-clipboard-x-api"
    );

    let resolvedPath = imagePath;

    try {
      resolvedPath = decodeURIComponent(resolvedPath);
    } catch {
      // ignore invalid URI sequence
    }

    let pathExists = await exists(resolvedPath);
    if (!pathExists) {
      const saveImagePath = await getDefaultSaveImagePath();
      const fallbackPath = join(saveImagePath, resolvedPath);
      if (await exists(fallbackPath)) {
        resolvedPath = fallbackPath;
        pathExists = true;
      }
    }

    if (!pathExists) {
      return null;
    }

    const imageData = await readFile(resolvedPath);

    // 将 Uint8Array 转换为 base64
    const base64 = btoa(
      imageData.reduce((data, byte) => data + String.fromCharCode(byte), ""),
    );

    return `data:image/png;base64,${base64}`;
  } catch (_error) {
    return null;
  }
};

// 同步收藏条目
export const syncFavoriteItem = async (
  item: DatabaseSchemaHistory,
  favorite: boolean,
) => {
  if (!globalStore.sync.enabled) return;

  if (favorite) {
    // 如果是图片类型，转换为 base64
    let payload: any = { ...item };

    if (item.type === "image" && item.value && typeof item.value === "string") {
      const base64Image = await imageToBase64(item.value);
      if (base64Image) {
        payload = {
          ...item,
          imageData: base64Image, // 添加 base64 图片数据
          value: item.value, // 保留原始路径
        };
      }
    }

    sendSyncMessage({
      payload,
      type: "ADD",
    });
  } else {
    sendSyncMessage({
      payload: { id: item.id },
      type: "DELETE",
    });
  }
};

import { emit } from "@tauri-apps/api/event";
import { BaseDirectory, exists, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { LISTEN_KEY } from "@/constants";
import {
  insertHistory,
  selectHistory,
  updateHistory,
} from "@/database/history";
import { writeToClipboard } from "@/plugins/clipboard";
import {
  setSyncConnected,
  setSyncConnecting,
  setSyncError,
  syncState,
} from "@/stores/syncState";
import { dayjs, formatDate } from "@/utils/dayjs";
import { useTauriListen } from "./useTauriListen";

// 全局重连函数引用
let globalReconnect: (() => void) | null = null;
let globalFetchLatest: (() => Promise<FetchLatestResult>) | null = null;

// 导出全局重连函数
export const forceReconnect = () => {
  if (globalReconnect) {
    globalReconnect();
    return;
  }

  void emit(LISTEN_KEY.SYNC_FORCE_RECONNECT);
};

export const forceFetchLatest = async () => {
  if (globalFetchLatest) {
    return globalFetchLatest();
  }

  return null;
};

// 保存 Base64 图片到本地
const saveBase64Image = async (
  base64Data: string,
  originalPath: string,
): Promise<string | null> => {
  // ... (implementation same as before)
  try {
    // 提取 Base64 数据
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 确定保存路径
    // 如果 originalPath 存在且有效，尝试使用原有文件名
    const fileName =
      originalPath.split(/[\\/]/).pop() || `sync_image_${Date.now()}.png`;

    // 检查 sync_images 目录是否存在，不存在则创建
    const syncDir = "sync_images";
    if (!(await exists(syncDir, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(syncDir, { baseDir: BaseDirectory.AppData, recursive: true });
    }

    const filePath = `${syncDir}/${fileName}`;

    // 写入文件
    await writeFile(filePath, bytes, { baseDir: BaseDirectory.AppData });

    // 返回完整路径
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const appData = await appDataDir();
    const absolutePath = await join(appData, filePath);

    return absolutePath;
  } catch (_error) {
    return null;
  }
};

// 上传本地收藏条目
const uploadLocalFavorites = async () => {
  try {
    const favorites = await selectHistory((qb) =>
      qb.where("favorite", "=", true),
    );

    for (const item of favorites) {
      let payload: any = { ...item };

      if (
        item.type === "image" &&
        item.value &&
        typeof item.value === "string"
      ) {
        const base64Image = await imageToBase64(item.value);
        if (base64Image) {
          payload = {
            ...item,
            imageData: base64Image,
            value: item.value,
          };
        }
      }

      sendSyncMessage({
        payload,
        type: "ADD",
      });
    }
  } catch (_error) {}
};

const buildLatestPayload = async (payload: DatabaseSchemaHistory) => {
  const latestPayload: any = {
    ...payload,
    deviceId: getOrCreateClientId(),
    deviceName: await getOrCreateDeviceName(),
  };

  if (
    payload.type === "image" &&
    payload.value &&
    typeof payload.value === "string"
  ) {
    const base64Image = await imageToBase64(payload.value);
    if (base64Image) {
      latestPayload.imageData = base64Image;
    }
  }

  return latestPayload;
};

const buildSyncToken = () => {
  if (!globalStore.sync.secretKey || !globalStore.sync.username) {
    return "";
  }

  return `${encodeURIComponent(globalStore.sync.username)}:${globalStore.sync.secretKey}`;
};

const buildHttpServerUrl = () => {
  if (!globalStore.sync.serverUrl) {
    return "";
  }

  return globalStore.sync.serverUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:");
};

const resolveLatestTimestamp = (payload: any): number | null => {
  const candidates = [
    payload?.timestamp,
    payload?.createTime,
    payload?.create_time,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate > 1e12 ? candidate : candidate * 1000;
    }

    if (typeof candidate === "string") {
      const normalized = candidate.trim();

      if (!normalized) {
        continue;
      }

      if (/^\d+$/.test(normalized)) {
        const value = Number(normalized);

        if (Number.isFinite(value)) {
          return value > 1e12 ? value : value * 1000;
        }
      }

      const parsed = dayjs(normalized);
      if (parsed.isValid()) {
        return parsed.valueOf();
      }
    }
  }

  return null;
};

const isStaleAutoLatest = (payload: any, source: LatestApplySource) => {
  if (source === "manual") {
    return false;
  }

  const timestamp = resolveLatestTimestamp(payload);
  if (!timestamp) {
    return false;
  }

  return Date.now() - timestamp > AUTO_LATEST_MAX_AGE_MS;
};

export const useSync = (enabled = true) => {
  const MAX_RECONNECT_ATTEMPTS = 5;
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptRef = useRef(0);
  const latestPollTimerRef = useRef<NodeJS.Timeout>();
  // 防止实时同步写入剪贴板后触发循环推送
  const suppressLatestPushRef = useRef(false);
  const recentRemoteAppliedRef = useRef<
    Array<{ id?: string; type: string; value: string; time: number }>
  >([]);

  const emitSyncStateChanged = () => {
    void emit(LISTEN_KEY.SYNC_STATE_CHANGED, {
      error: syncState.error,
      isConnected: syncState.isConnected,
      isConnecting: syncState.isConnecting,
      lastErrorTime: syncState.lastErrorTime,
      lastSyncTime: syncState.lastSyncTime,
    });
  };

  const applySyncConnecting = (connecting: boolean) => {
    setSyncConnecting(connecting);
    emitSyncStateChanged();
  };

  const applySyncConnected = (connected: boolean) => {
    setSyncConnected(connected);
    emitSyncStateChanged();
  };

  const applySyncError = (error: string) => {
    setSyncError(error);
    emitSyncStateChanged();
  };

  const markRemoteApplied = (id: unknown, type: string, value: unknown) => {
    if (typeof value !== "string" || !value) return;

    const now = Date.now();
    recentRemoteAppliedRef.current = [
      ...recentRemoteAppliedRef.current.filter(
        (item) => now - item.time < 6000,
      ),
      {
        id: typeof id === "string" && id ? id : undefined,
        time: now,
        type,
        value,
      },
    ];
  };

  const isRecentlyRemoteApplied = (payload: DatabaseSchemaHistory) => {
    if (typeof payload.value !== "string") return false;

    const now = Date.now();
    recentRemoteAppliedRef.current = recentRemoteAppliedRef.current.filter(
      (item) => now - item.time < 6000,
    );

    return recentRemoteAppliedRef.current.some(
      (item) =>
        (typeof payload.id === "string" && item.id === payload.id) ||
        (item.type === payload.type && item.value === payload.value),
    );
  };

  const createLatestHistoryItem = (
    payload: any,
    type: "text" | "image",
    value: string,
  ) => {
    return {
      createTime:
        typeof payload?.createTime === "string" && payload.createTime
          ? payload.createTime
          : formatDate(),
      favorite: false,
      group: "sync",
      id: typeof payload?.id === "string" && payload.id ? payload.id : nanoid(),
      search: typeof payload?.search === "string" ? payload.search : value,
      source:
        typeof payload?.deviceName === "string"
          ? payload.deviceName
          : undefined,
      type,
      value,
    } as DatabaseSchemaHistory;
  };

  const persistLatestHistoryItem = async (item: DatabaseSchemaHistory) => {
    if (typeof item.value !== "string") {
      return;
    }

    const [matched] = await selectHistory((qb) =>
      qb.where("type", "=", item.type).where("value", "=", item.value),
    );

    if (matched) {
      await updateHistory(
        matched.id,
        {
          createTime: item.createTime,
          group: "sync",
          source: item.source,
        },
        true,
      );
    } else {
      await insertHistory(item);
    }

    emit(LISTEN_KEY.REFRESH_CLIPBOARD_LIST);
  };

  const applyLatestPayload = async (
    payload: any,
    source: LatestApplySource,
  ): Promise<ApplyLatestResult> => {
    if (!payload) {
      return {
        applied: false,
        reason: "ignored-unsupported",
      };
    }

    // 忽略本机发出的 latest
    if (payload.deviceId === getOrCreateClientId()) {
      return {
        applied: false,
        reason: "ignored-self",
      };
    }

    if (isStaleAutoLatest(payload, source)) {
      return {
        applied: false,
        reason: "ignored-stale",
      };
    }

    if (payload.type === "text" && payload.value) {
      if (typeof payload.deviceName === "string") {
        setPendingLatestSource({
          deviceName: payload.deviceName,
          type: "text",
          value: payload.value,
        });
      }

      suppressLatestPushRef.current = true;
      const latestItem = createLatestHistoryItem(
        payload,
        "text",
        payload.value,
      );

      try {
        markRemoteApplied(payload?.id, latestItem.type, latestItem.value);
        await writeToClipboard(latestItem);
        await persistLatestHistoryItem(latestItem);
      } catch (_error) {
        return {
          applied: false,
          reason: "ignored-unsupported",
        };
      } finally {
        setTimeout(() => {
          suppressLatestPushRef.current = false;
        }, 2000);
      }

      return {
        applied: true,
        reason: "applied",
      };
    }

    if (payload.type === "image" && payload.imageData) {
      if (typeof payload.deviceName === "string") {
        setPendingLatestSource({
          deviceName: payload.deviceName,
          type: "image",
          value:
            typeof payload.value === "string"
              ? payload.value
              : payload.imageData,
        });
      }

      suppressLatestPushRef.current = true;

      try {
        const localImagePath = await saveBase64Image(
          payload.imageData,
          typeof payload.value === "string" ? payload.value : "",
        );

        if (localImagePath) {
          const latestItem = createLatestHistoryItem(
            payload,
            "image",
            localImagePath,
          );

          markRemoteApplied(payload?.id, latestItem.type, latestItem.value);
          await writeToClipboard(latestItem);

          await persistLatestHistoryItem(latestItem);

          return {
            applied: true,
            reason: "applied",
          };
        }
      } catch (_error) {
      } finally {
        setTimeout(() => {
          suppressLatestPushRef.current = false;
        }, 2000);
      }

      return {
        applied: false,
        reason: "ignored-unsupported",
      };
    }

    return {
      applied: false,
      reason: "ignored-unsupported",
    };
  };

  const fetchLatestFromServer = async (
    source: "connect" | "poll" | "manual" = "manual",
  ): Promise<FetchLatestResult> => {
    const shouldFetchLatest =
      globalStore.realtimeSync?.enabled &&
      globalStore.realtimeSync?.mode === "remote";

    if (!shouldFetchLatest) {
      return {
        applied: false,
        ok: false,
        reason: "realtime-disabled",
        source,
      };
    }

    const serverUrl = buildHttpServerUrl();
    const token = buildSyncToken();

    if (!serverUrl || !token) {
      return {
        applied: false,
        ok: false,
        reason: "missing-credentials",
        source,
      };
    }

    try {
      const response = await fetch(`${serverUrl}/api/latest`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return {
          applied: false,
          ok: false,
          reason: "http-error",
          source,
          status: response.status,
        };
      }

      const data = (await response.json()) as LatestApiResponse;
      if (!data.success || !data.data) {
        return {
          applied: false,
          ok: true,
          reason: "no-data",
          source,
          status: response.status,
        };
      }

      const applyResult = await applyLatestPayload(data.data, source);
      return {
        applied: applyResult.applied,
        ok: true,
        reason: applyResult.reason,
        source,
        status: response.status,
      };
    } catch (error) {
      return {
        applied: false,
        error: error instanceof Error ? error.message : String(error),
        ok: false,
        reason: "request-exception",
        source,
      };
    }
  };

  // 处理接收到的消息
  const handleMessage = async (message: SyncMessage) => {
    try {
      switch (message.type) {
        case "SYNC_ALL":
          if (message.data && Array.isArray(message.data)) {
            for (const item of message.data) {
              await processSyncItem(item);
            }
            // 触发列表刷新
            emit(LISTEN_KEY.REFRESH_CLIPBOARD_LIST);
          }
          break;

        case "ADD":
        case "UPDATE":
          await processSyncItem(message.payload);
          // 触发列表刷新
          emit(LISTEN_KEY.REFRESH_CLIPBOARD_LIST);
          break;

        case "DELETE":
          await processDelete(message.payload);
          // 触发列表刷新
          emit(LISTEN_KEY.REFRESH_CLIPBOARD_LIST);
          break;

        case "LATEST_UPDATE":
          await applyLatestPayload(message.payload, "realtime");
          break;

        default:
      }
    } catch (_error) {}
  };

  // 处理单个同步条目
  const processSyncItem = async (item: any) => {
    try {
      // 检查本地是否存在
      const existing = await selectHistory((qb) =>
        qb.where("id", "=", item.id),
      );

      const itemToSave = { ...item };
      delete itemToSave.imageData; // 数据库不存 imageData
      delete itemToSave.info; // 清理可能的额外字段

      // 如果是图片且包含 imageData，保存图片到本地
      if (item.type === "image" && item.imageData) {
        const newPath = await saveBase64Image(item.imageData, item.value);
        if (newPath) {
          itemToSave.value = newPath;
        }
      }

      if (existing && existing.length > 0) {
        // 更新存在的条目
        // 这里可以加更多逻辑，比如检查时间戳，防止覆盖更新的本地版本
        await updateHistory(
          item.id,
          {
            ...itemToSave,
            favorite: true, // 确保标记为收藏
          },
          true,
        );
      } else {
        // 插入新条目
        try {
          await insertHistory({
            ...itemToSave,
            favorite: true,
          });
        } catch (insertError: any) {
          // 处理竞争条件导致的UNIQUE constraint冲突
          if (
            insertError?.toString?.()?.includes?.("UNIQUE constraint failed")
          ) {
            await updateHistory(
              item.id,
              {
                ...itemToSave,
                favorite: true,
              },
              true,
            );
          } else {
            throw insertError;
          }
        }
      }
    } catch (_error) {}
  };

  // 处理删除
  const processDelete = async (payload: any) => {
    try {
      // 只是取消收藏，还是删除整个记录？
      // 假设我们只是同步收藏状态。如果另一端取消了收藏，我们也取消收藏。
      await updateHistory(payload.id, { favorite: false }, true);
    } catch (_error) {}
  };

  // 连接 WebSocket
  const connect = () => {
    // 只要配置了服务器地址和凭据即可连接（收藏夹同步或实时同步都需要连接）
    if (
      !globalStore.sync.serverUrl ||
      !globalStore.sync.secretKey ||
      !globalStore.sync.username
    ) {
      return;
    }

    applySyncConnecting(true);

    try {
      // 构建 WebSocket URL
      let wsUrl = `${globalStore.sync.serverUrl.replace(/\/+$/, "").replace(/^http/, "ws")}/ws`;
      // 如果有密钥，添加到 URL 参数中
      if (globalStore.sync.secretKey) {
        // combine username and secretKey
        const token = globalStore.sync.username
          ? `${encodeURIComponent(globalStore.sync.username)}:${globalStore.sync.secretKey}`
          : globalStore.sync.secretKey;
        wsUrl += `${wsUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
      }
      const ws = new WebSocket(wsUrl);

      ws.onopen = async () => {
        reconnectAttemptRef.current = 0;
        setIsConnected(true);
        globalIsConnected = true;
        applySyncConnected(true);

        // 发送客户端信息
        const clientInfo = await collectClientInfo();
        ws.send(
          JSON.stringify({
            payload: clientInfo,
            type: "CLIENT_INFO",
          }),
        );

        // 冷启动补偿：连接建立后拉取一次最新实时条目
        await fetchLatestFromServer("connect");

        // 仅在启用收藏夹同步时才执行双向同步
        if (globalStore.sync.enabled) {
          // 请求同步所有数据 (下载服务器数据)
          ws.send(
            JSON.stringify({
              type: "SYNC_REQUEST",
            }),
          );

          // 上传本地数据 (双向同步)
          uploadLocalFavorites();
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: SyncMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (_error) {}
      };

      ws.onerror = (_error) => {
        setIsConnected(false);
        globalIsConnected = false;
        applySyncConnected(false);
        applySyncError("连接错误，请检查服务器地址和状态");
      };

      ws.onclose = () => {
        setIsConnected(false);
        globalIsConnected = false;
        applySyncConnected(false);

        // 如果仍然需要连接（有服务器配置），尝试重连
        const { sync, realtimeSync } = globalStore;
        const shouldStayConnected =
          sync.serverUrl &&
          sync.secretKey &&
          sync.username &&
          (sync.enabled ||
            (realtimeSync?.enabled && realtimeSync?.mode === "remote"));
        if (shouldStayConnected) {
          if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
            applySyncError(
              `连接已断开，自动重连已达上限（${MAX_RECONNECT_ATTEMPTS}次）`,
            );
            return;
          }

          reconnectAttemptRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 5000);
        }
      };

      wsRef.current = ws;
      globalWs = ws;
    } catch (error) {
      setIsConnected(false);
      globalIsConnected = false;
      applySyncConnected(false);
      applySyncError(`创建连接失败: ${String(error)}`);
    }
  };

  // 断开连接
  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectAttemptRef.current = 0;

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    globalWs = null;
    globalIsConnected = false;
    setIsConnected(false);
    applySyncConnected(false);
  };

  useTauriListen(LISTEN_KEY.SYNC_FORCE_RECONNECT, () => {
    if (!enabled) return;

    reconnectAttemptRef.current = 0;
    disconnect();
    connect();
  });

  // 监听同步开关变化
  useEffect(() => {
    if (!enabled) {
      return;
    }

    globalFetchLatest = () => fetchLatestFromServer("manual");

    globalReconnect = () => {
      reconnectAttemptRef.current = 0;
      disconnect();
      connect();
    };

    const { sync, realtimeSync } = globalStore;
    const shouldConnect =
      sync.serverUrl &&
      sync.secretKey &&
      sync.username &&
      (sync.enabled ||
        (realtimeSync?.enabled && realtimeSync?.mode === "remote"));

    if (shouldConnect) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
      globalFetchLatest = null;
      globalReconnect = null;
    };
  }, [
    enabled,
    globalStore.sync.enabled,
    globalStore.sync.serverUrl,
    globalStore.sync.secretKey,
    globalStore.sync.username,
    globalStore.realtimeSync?.enabled,
    globalStore.realtimeSync?.mode,
  ]);

  // 兜底拉取 latest：防止偶发丢失 WS 下行消息
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (latestPollTimerRef.current) {
      clearInterval(latestPollTimerRef.current);
      latestPollTimerRef.current = undefined;
    }

    const shouldPollLatest =
      isConnected &&
      globalStore.realtimeSync?.enabled &&
      globalStore.realtimeSync?.mode === "remote";

    if (!shouldPollLatest) {
      return;
    }

    latestPollTimerRef.current = setInterval(() => {
      void fetchLatestFromServer("poll");
    }, 10000);

    return () => {
      if (latestPollTimerRef.current) {
        clearInterval(latestPollTimerRef.current);
        latestPollTimerRef.current = undefined;
      }
    };
  }, [
    enabled,
    isConnected,
    globalStore.realtimeSync?.enabled,
    globalStore.realtimeSync?.mode,
    globalStore.sync.serverUrl,
    globalStore.sync.username,
    globalStore.sync.secretKey,
  ]);

  // 监听历史记录更新
  useTauriListen<DatabaseSchemaHistory>(
    LISTEN_KEY.HISTORY_UPDATED,
    async ({ payload }) => {
      if (!enabled) return;

      if (payload.favorite) {
        syncFavoriteItem(payload, true);
      } else {
        syncFavoriteItem(payload, false);
      }
      // 实时同步（远程模式）：将最新条目推送给同 Token 下的其他设备
      if (
        globalStore.realtimeSync?.enabled &&
        globalStore.realtimeSync?.mode === "remote" &&
        !suppressLatestPushRef.current &&
        payload.group !== "sync" &&
        !isRecentlyRemoteApplied(payload)
      ) {
        const latestPayload = await buildLatestPayload(payload);
        sendSyncMessage({
          payload: latestPayload,
          type: "PUSH_LATEST",
        });
      }
    },
  );

  // 监听历史记录删除
  useTauriListen<DatabaseSchemaHistory>(
    LISTEN_KEY.HISTORY_DELETED,
    ({ payload }) => {
      if (!enabled) return;

      if (payload.favorite) {
        syncFavoriteItem(payload, false);
      }
    },
  );

  return {
    connect,
    disconnect,
    isConnected,
  };
};
