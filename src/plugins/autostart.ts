import { invoke } from "@tauri-apps/api/core";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";

const COMMAND = {
  IS_AUTOSTART: "plugin:pastex-autostart|is_autostart",
};

/**
 * 当前进程是否由系统自动启动拉起
 */
export const isAutostart = () => {
  return invoke<boolean>(COMMAND.IS_AUTOSTART);
};

/**
 * 是否已注册开机自动启动
 */
export const isAutostartRegistered = () => {
  return isAutostartEnabled();
};

/**
 * 设置开机自动启动
 */
export const setAutostartEnabled = async (enabled: boolean) => {
  if (enabled) {
    await enableAutostart();
    return;
  }

  await disableAutostart();
};
