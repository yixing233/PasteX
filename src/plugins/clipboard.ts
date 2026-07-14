import { emit } from "@tauri-apps/api/event";
import { exists } from "@tauri-apps/plugin-fs";
import {
  getDefaultSaveImagePath,
  writeFiles,
  writeHTML,
  writeImage,
  writeRTF,
  writeText,
} from "tauri-plugin-clipboard-x-api";
import { LISTEN_KEY } from "@/constants";
import { playPasteSound, setInternalPaste } from "@/plugins/audio";
import { clipboardStore } from "@/stores/clipboard";
import type { DatabaseSchemaHistory } from "@/types/database";
import { setPendingInternalClipboardWrite } from "@/utils/internalClipboard";
import { isColor, isEmail, isLikelyLocalPath, normalizeURL } from "@/utils/is";
import { join } from "@/utils/path";
import { paste } from "./paste";

export const getClipboardTextSubtype = async (value: string) => {
  try {
    const rawValue = String(value || "").trim();

    if (normalizeURL(rawValue)) {
      return "url";
    }

    if (isEmail(value)) {
      return "email";
    }

    if (isColor(value)) {
      return "color";
    }

    let normalizedPath = rawValue;

    try {
      normalizedPath = decodeURIComponent(normalizedPath);
    } catch {
      // ignore
    }

    normalizedPath = normalizedPath.replace(/^file:\/\/+/i, "");

    // Windows: 统一分隔符，兼容 D:\a/b/c.jpg 这类混合路径
    if (/^[a-zA-Z]:[\\/]/.test(normalizedPath)) {
      normalizedPath = normalizedPath.replace(/\//g, "\\");
    }

    if (await exists(normalizedPath)) {
      return "path";
    }

    if (isLikelyLocalPath(rawValue)) {
      return "path";
    }
  } catch {
    return;
  }
};

const emitHistoryUpdated = (data: DatabaseSchemaHistory) => {
  void emit(LISTEN_KEY.HISTORY_UPDATED, data);
};

export const writeToClipboard = async (
  data: DatabaseSchemaHistory,
  reason: "copy" | "paste" = "copy",
) => {
  const { type, value, search } = data;
  let payloadForEmit = data;

  setInternalPaste(true);

  switch (type) {
    case "text":
      await writeText(value);
      break;
    case "rtf":
      await writeRTF(search, value);
      break;
    case "html":
      await writeHTML(search, value);
      break;
    case "image":
      {
        let imagePath = String(value || "");

        if (!(await exists(imagePath))) {
          const saveImagePath = await getDefaultSaveImagePath();
          const fallbackPath = join(saveImagePath, imagePath);
          if (await exists(fallbackPath)) {
            imagePath = fallbackPath;
          }
        }

        await writeImage(imagePath);
        payloadForEmit = {
          ...data,
          value: imagePath,
        };
      }
      break;
    case "files":
      await writeFiles(value);
      break;
  }

  setPendingInternalClipboardWrite({
    reason,
    type: payloadForEmit.type,
    value: payloadForEmit.value,
  });

  emitHistoryUpdated(payloadForEmit);
};

/* import { playPasteSound } from "@/plugins/audio"; - Removed */
/* import { clipboardStatus } from "@/stores/clipboard"; - Removed */
/* Logic removed */

export const pasteToClipboard = async (
  data: DatabaseSchemaHistory,
  asPlain?: boolean,
) => {
  const { type, value, search } = data;
  const { pastePlain } = clipboardStore.content;

  setInternalPaste(true);

  playPasteSound();

  if (asPlain ?? pastePlain) {
    if (type === "files") {
      const plainText = value.join("\n");

      await writeText(plainText);

      setPendingInternalClipboardWrite({
        reason: "paste",
        type: "text",
        value: plainText,
      });

      emitHistoryUpdated({
        ...data,
        group: "text",
        search: plainText,
        type: "text",
        value: plainText,
      });
    } else {
      await writeText(search);

      setPendingInternalClipboardWrite({
        reason: "paste",
        type: "text",
        value: search,
      });

      emitHistoryUpdated({
        ...data,
        group: "text",
        search,
        type: "text",
        value: search,
      });
    }
  } else {
    await writeToClipboard(data, "paste");
  }

  return paste();
};
