import { getName, getVersion } from "@tauri-apps/api/app";
import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { platform } from "@tauri-apps/plugin-os";
import { omit } from "es-toolkit/compat";
import { getLocale } from "tauri-plugin-locale-api";
import { isAutostartRegistered } from "@/plugins/autostart";
import { clipboardStore } from "@/stores/clipboard";
import { globalStore } from "@/stores/global";
import type {
  BlacklistAppItem,
  CleaningRule,
  ClipboardTag,
  Language,
  Store,
} from "@/types/store";
import { deepAssign } from "./object";
import { getDefaultSaveDataDir, getSaveStorePath } from "./path";

/**
 * 初始化配置项
 */
const initStore = async () => {
  globalStore.appearance.language ??= await getLocale<Language>();
  globalStore.env.platform = platform();
  globalStore.env.appName = await getName();
  globalStore.env.appVersion = await getVersion();
  globalStore.env.saveDataDir ??= await getDefaultSaveDataDir();
  globalStore.app.autoStart = await isAutostartRegistered().catch(() => false);

  // @ts-expect-error
  if (clipboardStore.window.style === "float") {
    clipboardStore.window.style = "standard";
  }

  const blacklistApps = (
    (clipboardStore.content.blacklistApps || []) as unknown[]
  )
    .map((item) => {
      if (typeof item === "string") {
        const value = item.trim();
        return value ? { name: value, process: value } : null;
      }

      const name = String((item as BlacklistAppItem)?.name || "").trim();
      const process = String((item as BlacklistAppItem)?.process || "").trim();

      if (!name && !process) return null;

      return {
        name: name || process,
        process: process || name,
      };
    })
    .filter(Boolean) as BlacklistAppItem[];

  clipboardStore.content.blacklistApps = blacklistApps;
  clipboardStore.tags = ((clipboardStore.tags || []) as ClipboardTag[])
    .map((tag) => ({
      color: String(tag.color || "blue"),
      id: String(tag.id || "").trim(),
      name: String(tag.name || "").trim(),
    }))
    .filter((tag) => tag.id && tag.name);
  clipboardStore.content.cleaningRules = (
    (clipboardStore.content.cleaningRules || []) as CleaningRule[]
  )
    .map((rule) => ({
      enabled: rule.enabled !== false,
      id: String(rule.id || "").trim(),
      name: String(rule.name || "").trim(),
      pattern: String(rule.pattern || ""),
      replacement: String(rule.replacement || ""),
    }))
    .filter((rule) => rule.id && rule.name && rule.pattern);
  clipboardStore.content.maskSensitive ??= false;

  await mkdir(globalStore.env.saveDataDir, { recursive: true });
};

/**
 * 本地存储配置项
 * @param backup 是否为备份数据
 */
export const saveStore = async (backup = false) => {
  const store = { clipboardStore, globalStore };

  const path = await getSaveStorePath(backup);

  return writeTextFile(path, JSON.stringify(store, null, 2));
};

/**
 * 从本地存储恢复配置项
 * @param backup 是否为备份数据
 */
export const restoreStore = async (backup = false) => {
  const path = await getSaveStorePath(backup);

  const existed = await exists(path);

  if (existed) {
    try {
      const content = await readTextFile(path);
      const store: Store = JSON.parse(content);
      const nextGlobalStore = omit(store.globalStore, backup ? "env" : "");

      deepAssign(globalStore, nextGlobalStore);
      deepAssign(clipboardStore, store.clipboardStore);
    } catch {
      // ...existing code...
    }
  }

  if (backup) return;

  return initStore();
};
