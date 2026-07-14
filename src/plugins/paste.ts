import { invoke } from "@tauri-apps/api/core";

export const COMMAND = {
  PASTE: "plugin:pastex-paste|paste",
};

/**
 * 粘贴剪贴板内容
 */
export const paste = () => {
  return invoke(COMMAND.PASTE);
};
