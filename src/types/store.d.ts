import type { Platform } from "@tauri-apps/plugin-os";

export type Theme = "auto" | "light" | "dark";

export type Language = (typeof LANGUAGE)[keyof typeof LANGUAGE];

export interface Store {
  globalStore: GlobalStore;
  clipboardStore: ClipboardStore;
}

export interface GlobalStore {
  // 应用设置
  app: {
    autoStart: boolean;
    silentStart: boolean;
    showMenubarIcon: boolean;
    showTaskbarIcon: boolean;
  };

  // 外观设置
  appearance: {
    theme: Theme;
    isDark: boolean;
    language?: Language;
  };

  update: {
    auto: boolean;
    beta: boolean;
  };

  // 快捷键设置
  shortcut: {
    clipboard: string;
    linkPrompt: string;
    preference?: string;
    quickPaste: {
      enable: boolean;
      value: string;
    };
    pastePlain: string;
  };

  // 同步设置
  sync: {
    enabled: boolean;
    serverUrl: string;
    username: string;
    secretKey: string;
  };

  // 局域网同步
  lanSync: {
    enabled: boolean;
    port: number;
    // Hide this if not necessary, but good for display
    ip?: string;
  };

  // 实时同步
  realtimeSync: {
    enabled: boolean;
    mode: "remote" | "lan";
  };

  // 只在当前系统环境使用
  env: {
    platform?: Platform;
    appName?: string;
    appVersion?: string;
    saveDataDir?: string;
  };
}

export type ClickFeedback = "none" | "copy" | "paste";

export type OperationButton =
  | "copy"
  | "pastePlain"
  | "note"
  | "star"
  | "delete"
  | "edit"
  | "open";

export interface BlacklistAppItem {
  name: string;
  process: string;
}

export interface ClipboardTag {
  color: string;
  id: string;
  name: string;
}

export interface CleaningRule {
  enabled: boolean;
  id: string;
  name: string;
  pattern: string;
  replacement: string;
}

export interface ClipboardStore {
  tags: ClipboardTag[];

  // 窗口设置
  window: {
    style: "standard" | "dock";
    position: "remember" | "follow" | "center";
    edgeAutoHide: boolean;
    backTop: boolean;
    showAll: boolean;
    linkOpenPrompt: boolean;
  };

  // 搜索框设置
  search: {
    position: "top" | "bottom";
    defaultFocus: boolean;
    autoClear: boolean;
  };

  audio: {
    copy: boolean;
    paste: boolean;
    copyPath?: string;
    pastePath?: string;
  };

  // 剪贴板内容设置
  content: {
    autoPaste: "single" | "double";
    copyPlain: boolean;
    pastePlain: boolean;
    operationButtons: OperationButton[];
    autoFavorite: boolean;
    deleteConfirm: boolean;
    autoSort: boolean;
    showOriginalContent: boolean;
    trackSource: boolean;
    showCharCount: boolean;
    showImageSize: boolean;
    maskSensitive: boolean;
    cleaningRules: CleaningRule[];
    blacklistApps: BlacklistAppItem[];
    defaultApps: {
      text?: string;
      image?: string;
      audio?: string;
      html?: string;
      rtf?: string;
      files?: string;
      link?: string;
    };
  };

  // 历史记录
  history: {
    duration: number;
    unit: number;
    maxCount: number;
  };
}
