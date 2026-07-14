import { isMac } from "@/utils/is";

export const REPOSITORY_LINK = "https://github.com/yixing233/PasteX";

export const ISSUES_LINK = `${REPOSITORY_LINK}/issues`;

export const UPDATE_MESSAGE_KEY = "app-update-message";

export const WINDOW_LABEL = {
  MAIN: "main",
  PREFERENCE: "preference",
} as const;

export const LANGUAGE = {
  EN_US: "en-US",
  JA_JP: "ja-JP",
  ZH_CN: "zh-CN",
  ZH_TW: "zh-TW",
} as const;

export const LISTEN_KEY = {
  ACTIVATE_BACK_TOP: "activate-back-top",
  CLIPBOARD_ITEM_DELETE: "clipboard-item-delete",
  CLIPBOARD_ITEM_FAVORITE: "clipboard-item-favorite",
  CLIPBOARD_ITEM_PASTE: "clipboard-item-paste",
  CLIPBOARD_ITEM_PREVIEW: "clipboard-item-preview",
  CLIPBOARD_ITEM_SELECT_NEXT: "clipboard-item-select-next",
  CLIPBOARD_ITEM_SELECT_PREV: "clipboard-item-select-prev",
  CLOSE_DATABASE: "close-database",
  HISTORY_DELETED: "history-deleted",
  HISTORY_UPDATED: "history-updated",
  REFRESH_CLIPBOARD_LIST: "refresh-clipboard-list",
  SHOW_WINDOW: "show-window",
  STORE_CHANGED: "store-changed",
  SYNC_FORCE_RECONNECT: "sync-force-reconnect",
  SYNC_STATE_CHANGED: "sync-state-changed",
  TOGGLE_LISTEN_CLIPBOARD: "toggle-listen-clipboard",
  UPDATE_APP: "update-app",
};

export const PRESET_SHORTCUT = {
  FAVORITE: isMac ? "meta.d" : "ctrl.d",
  FIXED_WINDOW: isMac ? "meta.p" : "ctrl.p",
  HIDE_WINDOW: isMac ? "meta.w" : "ctrl.w",
  OPEN_LINK_PROMPT: isMac ? "meta.q" : "ctrl.q",
  OPEN_PREFERENCES: isMac ? "meta.comma" : "ctrl.comma",
  SEARCH: isMac ? "meta.f" : "ctrl.f",
};

export const GLOBAL_SHORTCUT = {
  OPEN_LINK_PROMPT: isMac ? "Command+Q" : "Ctrl+Q",
  SEQUENTIAL_PASTE: "Alt+Shift+V",
} as const;
