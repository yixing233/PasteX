import { invoke } from "@tauri-apps/api/core";
import { clipboardStore } from "@/stores/clipboard";

let internalWriteUntil = 0;
let lastCopySoundAt = 0;

const COPY_SOUND_COOLDOWN_MS = 250;

const isInternalClipboardWriteActive = () => Date.now() < internalWriteUntil;

export const playCopySound = () => {
  const now = Date.now();

  if (!clipboardStore.audio.copy) return;
  if (isInternalClipboardWriteActive()) return;
  if (now - lastCopySoundAt < COPY_SOUND_COOLDOWN_MS) return;

  lastCopySoundAt = now;

  invoke("play_sound", {
    event: "copy",
    path: clipboardStore.audio.copyPath,
  }).catch(() => {});
};

export const playPasteSound = () => {
  if (clipboardStore.audio.paste) {
    invoke("play_sound", {
      event: "paste",
      path: clipboardStore.audio.pastePath,
    }).catch(() => {});
  }
};

export const previewAudio = (type: "copy" | "paste") => {
  invoke("play_sound", {
    event: type,
    path:
      type === "copy"
        ? clipboardStore.audio.copyPath
        : clipboardStore.audio.pastePath,
  }).catch(() => {});
};

export const setInternalPaste = (value: boolean, durationMs = 1500) => {
  if (!value) {
    internalWriteUntil = 0;
    return;
  }

  internalWriteUntil = Math.max(internalWriteUntil, Date.now() + durationMs);
};
