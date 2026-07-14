import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { cloneDeep } from "es-toolkit";
import { isEmpty, remove } from "es-toolkit/compat";
import { nanoid } from "nanoid";
import { useEffect, useRef } from "react";
import {
  type ClipboardChangeOptions,
  onClipboardChange,
  startListening,
} from "tauri-plugin-clipboard-x-api";
import { fullName } from "tauri-plugin-fs-pro-api";
import { LISTEN_KEY } from "@/constants";
import {
  insertHistory,
  selectHistory,
  updateHistory,
} from "@/database/history";
import type { State } from "@/pages/Main";
import { playCopySound } from "@/plugins/audio";
import { getClipboardTextSubtype } from "@/plugins/clipboard";
import { openLinkPromptWindow } from "@/plugins/linkPrompt";
import { clipboardStore } from "@/stores/clipboard";
import type { DatabaseSchemaHistory } from "@/types/database";
import type { BlacklistAppItem } from "@/types/store";
import { applyCleaningRules } from "@/utils/contentRules";
import { formatDate } from "@/utils/dayjs";
import { consumePendingInternalClipboardWrite } from "@/utils/internalClipboard";
import { isImage, isLikelyLocalPath, normalizeURL } from "@/utils/is";
import { consumePendingLatestSource } from "@/utils/latestSource";
import { parseTagIds } from "@/utils/tags";

export const useClipboard = (
  state: State,
  options?: ClipboardChangeOptions,
) => {
  interface ClipboardSourceDetail {
    name: string;
    path?: string;
  }

  const shouldIgnoreByBlacklist = (source?: string) => {
    if (!source) return false;

    const list = (clipboardStore.content.blacklistApps || [])
      .map((item) => {
        if (typeof item === "string") return item;
        return (item as BlacklistAppItem).process;
      })
      .map((item) =>
        String(item || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);

    if (!list.length) return false;

    return list.includes(String(source).trim().toLowerCase());
  };

  const showUrlOpenPrompt = (url: string) => {
    const safeUrl = String(url || "").trim();

    if (!safeUrl || !clipboardStore.window.linkOpenPrompt) {
      return;
    }

    void openLinkPromptWindow(safeUrl);
  };

  const normalizeClipboardFingerprint = (value: string) =>
    String(value || "")
      .replace(/\r\n/g, "\n")
      .trim();

  const lastClipboardRef = useRef<{ value: string; time: number }>({
    time: 0,
    value: "",
  });

  useEffect(() => {
    let disposed = false;
    let unlisten: undefined | (() => void);

    const setup = async () => {
      await startListening();

      const off = await onClipboardChange(async (result) => {
        if (disposed) return;

        const { files, image, rtf, text } = result;

        if (isEmpty(result) || Object.values(result).every(isEmpty)) return;

        const { copyPlain } = clipboardStore.content;
        const now = Date.now();
        let currentValue = "";

        if (files) {
          currentValue = files.value.join("");
        } else if (rtf && !copyPlain) {
          currentValue = rtf.value;
        } else if (text) {
          currentValue = text.value;
        } else if (image) {
          currentValue = image.value;
        }

        // 去重指纹：优先使用 text（很多应用会先后写入富文本与纯文本，内容相同会触发多次）
        const currentFingerprint = normalizeClipboardFingerprint(
          text?.value || currentValue,
        );

        if (
          currentFingerprint === lastClipboardRef.current.value &&
          now - lastClipboardRef.current.time < 1000
        ) {
          return;
        }

        lastClipboardRef.current = {
          time: now,
          value: currentFingerprint,
        };

        const data = {
          createTime: formatDate(),
          favorite: false,
          group: "text",
          id: nanoid(),
          search: text?.value,
          tags: "[]",
        } as DatabaseSchemaHistory;

        if (files) {
          Object.assign(data, files, {
            group: "files",
            search: files.value.join(" "),
          });
        } else if (rtf && !copyPlain) {
          Object.assign(data, rtf, {
            group: "rtf",
          });
        } else if (text) {
          const cleanedValue = applyCleaningRules(
            text.value,
            clipboardStore.content.cleaningRules,
          );

          if (!cleanedValue.trim()) return;

          const subtype = await getClipboardTextSubtype(cleanedValue);
          let group: any = "text";
          const isLocalPath =
            subtype === "path" || isLikelyLocalPath(cleanedValue);

          if (subtype === "url") group = "url";
          if (subtype === "color") group = "color";
          if (isLocalPath) {
            group = isImage(cleanedValue) ? "image" : "path";
          }
          if (subtype === "email") group = "email";

          Object.assign(data, text, {
            count: cleanedValue.length,
            group,
            search: cleanedValue,
            subtype: isLocalPath ? "path" : subtype,
            value: cleanedValue,
          });
        } else if (image) {
          Object.assign(data, image, {
            group: "image",
          });
        }

        const latestSource = consumePendingLatestSource(data.type, data.value);

        if (latestSource) {
          data.group = "sync";
          data.source = latestSource.deviceName;
        }

        const needClipboardSource =
          !data.source &&
          (clipboardStore.content.trackSource ||
            (clipboardStore.content.blacklistApps?.length ?? 0) > 0);

        // 获取剪贴板来源软件（用于来源显示和黑名单过滤）
        if (needClipboardSource) {
          try {
            const source = await invoke<ClipboardSourceDetail>(
              "get_clipboard_source_detail",
            );
            if (
              source.name &&
              source.name !== "Unknown" &&
              source.name !== "Unsupported"
            ) {
              data.source = source.name;
              data.sourcePath = source.path;
            }
          } catch (_error) {}
        }

        if (shouldIgnoreByBlacklist(data.source)) {
          return;
        }

        const internalClipboardWrite = consumePendingInternalClipboardWrite(
          data.type,
          data.value,
        );
        const shouldAutoSortMatchedItem =
          clipboardStore.content.autoSort && !internalClipboardWrite;

        playCopySound();

        // 无论后续走 text/rtf/html 哪条分支，只要本次事件里含有 URL 文本就弹提示窗。
        const copiedText = String(
          data.type === "text" ? data.value : text?.value || "",
        ).trim();
        const copiedUrl = normalizeURL(copiedText);
        if (copiedUrl) {
          showUrlOpenPrompt(copiedUrl);
        }

        const sqlData = cloneDeep(data);

        const { type, value, createTime } = data;

        if (type === "image") {
          sqlData.value = await fullName(value);
        }

        if (type === "files") {
          sqlData.value = JSON.stringify(value);
        }

        const isVisible = (item: DatabaseSchemaHistory) => {
          if (state.group === "favorite" && !item.favorite) return false;
          if (
            state.group !== "all" &&
            state.group !== "favorite" &&
            state.group !== item.group
          ) {
            return false;
          }

          const search = state.search?.trim().toLowerCase();
          if (
            search &&
            ![item.search, item.note, item.source]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(search))
          ) {
            return false;
          }

          const sourceFilter = state.sourceFilter?.trim().toLowerCase();
          if (
            sourceFilter &&
            !String(item.source || "")
              .toLowerCase()
              .includes(sourceFilter)
          ) {
            return false;
          }

          const itemTagIds = new Set(parseTagIds(item.tags));
          if (state.tagFilters.some((tagId) => !itemTagIds.has(tagId))) {
            return false;
          }

          if (
            state.dateRange &&
            (item.createTime < state.dateRange[0] ||
              item.createTime > state.dateRange[1])
          ) {
            return false;
          }

          return true;
        };

        const toVisibleMatchedItem = (matched: DatabaseSchemaHistory) =>
          ({
            ...matched,
            createTime,
            value: data.value,
          }) as DatabaseSchemaHistory;

        const [matched] = await selectHistory((qb) => {
          const { type, value } = sqlData;

          return qb.where("type", "=", type).where("value", "=", value);
        });

        if (matched) {
          if (!shouldAutoSortMatchedItem) {
            return;
          }

          const { id } = matched;
          const nextItem = toVisibleMatchedItem(matched);

          remove(state.list, { id });
          if (isVisible(nextItem)) {
            state.list.unshift(nextItem);
          }

          return updateHistory(id, { createTime });
        }

        // 并发兜底：同一时刻可能有多个监听事件并行，插入前再查一次避免重复写入
        const [matchedAgain] = await selectHistory((qb) => {
          const { type, value } = sqlData;

          return qb.where("type", "=", type).where("value", "=", value);
        });

        if (matchedAgain) {
          if (!shouldAutoSortMatchedItem) {
            return;
          }

          const { id } = matchedAgain;
          const nextItem = toVisibleMatchedItem(matchedAgain);

          remove(state.list, { id });
          if (isVisible(nextItem)) {
            state.list.unshift(nextItem);
          }

          return updateHistory(id, { createTime });
        }

        if (isVisible(data)) {
          state.list.unshift(data);
        }

        await insertHistory(sqlData);
        emit(LISTEN_KEY.HISTORY_UPDATED, sqlData as DatabaseSchemaHistory);
      }, options);

      unlisten = off;
    };

    void setup();

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
};
