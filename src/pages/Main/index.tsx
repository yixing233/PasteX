import { useEventEmitter, useKeyPress, useMount, useReactive } from "ahooks";
import type { EventEmitter } from "ahooks/lib/useEventEmitter";
import { range } from "es-toolkit";
import { find, last } from "es-toolkit/compat";
import { createContext } from "react";
import { startListening, stopListening } from "tauri-plugin-clipboard-x-api";
import { useSnapshot } from "valtio";
import { GLOBAL_SHORTCUT, LISTEN_KEY, PRESET_SHORTCUT } from "@/constants";
import { useClipboard } from "@/hooks/useClipboard";
import { useEdgeAutoHide } from "@/hooks/useEdgeAutoHide";
import { useImmediateKey } from "@/hooks/useImmediateKey";
import { useRegister } from "@/hooks/useRegister";
import { useSubscribeKey } from "@/hooks/useSubscribeKey";
import { useTauriListen } from "@/hooks/useTauriListen";
import { pasteToClipboard } from "@/plugins/clipboard";
import { openCurrentLinkPrompt } from "@/plugins/linkPrompt";
import {
  showTaskbarIcon,
  showWindow,
  toggleWindowVisible,
} from "@/plugins/window";
import { clipboardStore } from "@/stores/clipboard";
import { globalStore } from "@/stores/global";
import type {
  DatabaseSchemaGroupId,
  DatabaseSchemaHistory,
} from "@/types/database";
import type { Store } from "@/types/store";
import type { DockEdge } from "@/utils/edgeAutoHide";
import { deepAssign } from "@/utils/object";
import DockMode from "./components/DockMode";
import StandardMode from "./components/StandardMode";

interface EventBusPayload {
  id: string;
  action: string;
}

export interface State {
  group: DatabaseSchemaGroupId;
  search?: string;
  pinned?: boolean;
  activeId?: string;
  list: DatabaseSchemaHistory[];
  eventBus?: EventEmitter<EventBusPayload>;
  quickPasteKeys: string[];
  dateRange?: [string, string];
  sourceFilter?: string;
  tagFilters: string[];
  pasteQueue: DatabaseSchemaHistory[];
  pasteNext?: () => void;
  edgeDocked?: boolean;
  edgeCollapsed?: boolean;
  edgeDockEdge?: DockEdge;
}

const INITIAL_STATE: State = {
  group: "all",
  list: [],
  pasteQueue: [],
  quickPasteKeys: [],
  tagFilters: [],
};

interface MainContextValue {
  rootState: State;
}

export const MainContext = createContext<MainContextValue>({
  rootState: INITIAL_STATE,
});

const Main = () => {
  const state = useReactive<State>(INITIAL_STATE);
  const { shortcut } = useSnapshot(globalStore);
  const { window } = useSnapshot(clipboardStore);
  const eventBus = useEventEmitter<EventBusPayload>();

  const normalizeShortcut = (value?: string) =>
    value?.replace(/\s+/g, "").toLowerCase();

  const isPreferenceShortcutConflict =
    normalizeShortcut(shortcut.preference) ===
    normalizeShortcut(shortcut.clipboard);

  useMount(() => {
    state.eventBus = eventBus;
    state.pasteNext = pasteNext;
  });

  useClipboard(state);
  useEdgeAutoHide(state);

  // 任务栏图标的显示与隐藏
  useImmediateKey(globalStore.app, "showTaskbarIcon", showTaskbarIcon);

  // 同步配置项
  useTauriListen<Store>(LISTEN_KEY.STORE_CHANGED, ({ payload }) => {
    deepAssign(globalStore, payload.globalStore);
    deepAssign(clipboardStore, payload.clipboardStore);
  });

  // 窗口显示与隐藏
  useRegister(toggleWindowVisible, [shortcut.clipboard]);

  // 链接提示窗不可靠地获取焦点，因此使用全局快捷键触发打开。
  useRegister(openCurrentLinkPrompt, [GLOBAL_SHORTCUT.OPEN_LINK_PROMPT]);

  const pasteNext = async () => {
    const [next, ...rest] = state.pasteQueue;
    if (!next) return;

    state.pasteQueue = rest;
    try {
      await pasteToClipboard(next);
    } catch (error) {
      state.pasteQueue = [next, ...state.pasteQueue];
      throw error;
    }
  };

  useRegister(pasteNext, [GLOBAL_SHORTCUT.SEQUENTIAL_PASTE]);

  // 打开偏好设置窗口（全局快捷键）
  useRegister(() => {
    showWindow("preference");
  }, [
    shortcut.preference && !isPreferenceShortcutConflict
      ? shortcut.preference
      : undefined,
  ]);

  // 打开偏好设置窗口
  useKeyPress(PRESET_SHORTCUT.OPEN_PREFERENCES, () => {
    showWindow("preference");
  });

  // 设置快捷粘贴的快捷键
  const setQuickPasteKeys = () => {
    const { enable, value } = globalStore.shortcut.quickPaste;

    if (!enable) {
      state.quickPasteKeys = [];

      return;
    }

    state.quickPasteKeys = range(1, 10).map((item) => [value, item].join("+"));
  };

  // 监听快速粘贴的启用状态变更
  useImmediateKey(globalStore.shortcut.quickPaste, "enable", () => {
    setQuickPasteKeys();
  });

  // 监听快速粘贴的快捷键变更
  useSubscribeKey(globalStore.shortcut.quickPaste, "value", () => {
    setQuickPasteKeys();
  });

  // 切换剪贴板监听状态
  useTauriListen<boolean>(LISTEN_KEY.TOGGLE_LISTEN_CLIPBOARD, ({ payload }) => {
    if (payload) {
      startListening();
    } else {
      stopListening();
    }
  });

  // 监听粘贴为纯文本的快捷键
  useKeyPress(shortcut.pastePlain, (event) => {
    event.preventDefault();

    const data = find(state.list, { id: state.activeId });

    if (!data) return;

    pasteToClipboard(data, true);
  });

  // 监听快速粘贴的快捷键
  useRegister(
    async (event) => {
      if (!globalStore.shortcut.quickPaste.enable) return;

      const index = Number(last(event.shortcut));

      const data = state.list[index - 1];

      pasteToClipboard(data);
    },
    [state.quickPasteKeys],
  );

  return (
    <MainContext.Provider
      value={{
        rootState: state,
      }}
    >
      {window.style === "standard" ? <StandardMode /> : <DockMode />}
    </MainContext.Provider>
  );
};

export default Main;
