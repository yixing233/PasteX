import { proxy } from "valtio";
import type { ClipboardStore } from "@/types/store";

export const clipboardStore = proxy<ClipboardStore>({
  audio: {
    copy: false,
    paste: false,
  },
  content: {
    autoFavorite: false,
    autoPaste: "double",
    autoSort: false,
    blacklistApps: [],
    cleaningRules: [],
    copyPlain: false,
    defaultApps: {},
    deleteConfirm: true,
    maskSensitive: false,
    operationButtons: ["copy", "star", "delete"],
    pastePlain: false,
    showCharCount: true,
    showImageSize: true,
    showOriginalContent: false,
    trackSource: true,
  },

  history: {
    duration: 0,
    maxCount: 0,
    unit: 1,
  },

  search: {
    autoClear: true,
    defaultFocus: false,
    position: "top",
  },
  tags: [],
  window: {
    backTop: false,
    edgeAutoHide: false,
    linkOpenPrompt: false,
    position: "remember",
    showAll: false,
    style: "standard",
  },
});
