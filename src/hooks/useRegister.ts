import {
  register,
  type ShortcutHandler,
  unregister,
} from "@tauri-apps/plugin-global-shortcut";
import { useAsyncEffect, useUnmount } from "ahooks";
import { castArray } from "es-toolkit/compat";
import { useState } from "react";

const toShortcutList = (shortcut: string | string[] | undefined) =>
  castArray(shortcut).filter(Boolean) as string[];

const safeUnregister = async (shortcut: string) => {
  try {
    await unregister(shortcut);
  } catch {
    // Ignore unregister errors so register flow stays idempotent.
  }
};

export const useRegister = (
  handler: ShortcutHandler,
  deps: Array<string | string[] | undefined>,
) => {
  const [oldShortcuts, setOldShortcuts] = useState(deps[0]);

  useAsyncEffect(async () => {
    const [shortcuts] = deps;
    const oldList = toShortcutList(oldShortcuts);
    const nextList = toShortcutList(shortcuts);

    for await (const shortcut of oldList) {
      await safeUnregister(shortcut);
    }

    if (nextList.length === 0) return;

    // In dev (StrictMode remount) or after hot reload, the same hotkey can remain
    // registered briefly. Unregister first to keep registration idempotent.
    for await (const shortcut of nextList) {
      await safeUnregister(shortcut);
    }

    const registerHandler = (event: Parameters<ShortcutHandler>[0]) => {
      if (event.state === "Released") return;

      handler(event);
    };

    const registerShortcuts = async () => {
      await register(nextList, registerHandler);
    };

    try {
      await registerShortcuts();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Dev hot-reload / strict-mode remount can briefly race and leave stale hotkey.
      if (/already registered/i.test(message)) {
        for await (const shortcut of nextList) {
          await safeUnregister(shortcut);
        }

        // Give native global shortcut manager a short grace period.
        await new Promise((resolve) => setTimeout(resolve, 50));

        try {
          await registerShortcuts();
        } catch (retryError) {
          const retryMessage =
            retryError instanceof Error
              ? retryError.message
              : String(retryError);

          // Keep app functional when dev hot reload produces transient duplicates.
          if (!/already registered/i.test(retryMessage)) {
            throw retryError;
          }

          // Ignore duplicate registration in transient dev reload races.
        }
      } else {
        throw error;
      }
    }

    setOldShortcuts(shortcuts);
  }, deps);

  useUnmount(() => {
    const [shortcuts] = deps;

    if (!shortcuts) return;

    void unregister(shortcuts).catch(() => {
      // Ignore on unmount to prevent unhandled promise rejection.
    });
  });
};
