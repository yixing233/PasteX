import { getName } from "@tauri-apps/api/app";
import { appDataDir, resourceDir, sep } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { last } from "es-toolkit";
import { globalStore } from "@/stores/global";
import { isDev } from "./is";

/**
 * 拼接文件路径
 * @param paths 路径数组
 */
export function join(...paths: string[]) {
  const joinPaths = paths.map((path, index) => {
    if (index === 0) {
      return path.replace(new RegExp(`${sep()}+$`), "");
    }

    return path.replace(new RegExp(`^${sep()}+|${sep()}+$`, "g"), "");
  });

  return joinPaths.join(sep());
}

/**
 * 获取存储数据的目录
 */
export const getSaveDataPath = () => {
  return join(globalStore.env.saveDataDir!);
};

/**
 * 获取安装目录
 */
export const getInstallDir = async () => {
  try {
    const dir = await invoke<string>("get_install_dir_cmd");

    if (dir) return join(dir);
  } catch {
    // fallback to tauri path APIs when invoke is unavailable
  }

  try {
    return join(await resourceDir());
  } catch {
    return join(await appDataDir());
  }
};

/**
 * 获取默认存储数据目录
 */
export const getDefaultSaveDataDir = async () => {
  return join(await getInstallDir(), "data");
};

/**
 * 获取默认日志目录
 */
export const getDefaultLogDir = async () => {
  return join(await getInstallDir(), "logs");
};

/**
 * 获取数据库文件存储路径
 */
export const getSaveDatabasePath = async () => {
  const appName = await getName();
  const extname = isDev() ? "dev.db" : "db";

  return join(getSaveDataPath(), `${appName}.${extname}`);
};

/**
 * 获取存储图片的路径
 */
export const getSaveImagePath = () => {
  return join(getSaveDataPath(), "images");
};

/**
 * 存储数据的目录名
 */
export const getSaveDataDirName = () => {
  return last(getSaveDataPath().split(sep())) as string;
};

/**
 * 存储配置项的路径
 * @param backup 是否是备份数据
 */
export const getSaveStorePath = async (backup = false) => {
  const extname = isDev() ? "dev.json" : "json";

  if (backup) {
    return join(getSaveDataPath(), `.store-backup.${extname}`);
  }

  return join(await getInstallDir(), `.store.${extname}`);
};

/**
 * 存储窗口位置的路径
 */
export const getSaveWindowStatePath = async () => {
  const extname = isDev() ? "dev.json" : "json";

  return join(await getInstallDir(), `.window-state.${extname}`);
};
