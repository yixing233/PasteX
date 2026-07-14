import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useKeyPress } from "ahooks";
import clsx from "clsx";
import { useContext, useEffect, useRef } from "react";
import { useSnapshot } from "valtio";
import UnoIcon from "@/components/UnoIcon";
import { PRESET_SHORTCUT } from "@/constants";
import { useTauriFocus } from "@/hooks/useTauriFocus";
import { hideWindow } from "@/plugins/window";
import { clipboardStore } from "@/stores/clipboard";
import { MainContext } from "../..";

const WindowPin = () => {
  const { rootState } = useContext(MainContext);
  const { window } = useSnapshot(clipboardStore);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const syncPinnedState = async () => {
      const appWindow = getCurrentWebviewWindow();
      const pinned = await appWindow.isAlwaysOnTop();
      rootState.pinned = pinned;
    };

    void syncPinnedState();

    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, [rootState]);

  useKeyPress(PRESET_SHORTCUT.FIXED_WINDOW, () => {
    void togglePin();
  });

  useTauriFocus({
    onBlur() {
      if (rootState.pinned || rootState.edgeDocked) return;

      if (window.edgeAutoHide && window.position === "remember") {
        if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
        blurTimerRef.current = setTimeout(() => {
          if (!rootState.pinned && !rootState.edgeDocked) {
            hideWindow();
          }
        }, 350);
        return;
      }

      hideWindow();
    },
    onFocus() {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    },
  });

  const togglePin = async () => {
    const appWindow = getCurrentWebviewWindow();
    const nextPinned = !rootState.pinned;

    await appWindow.setAlwaysOnTop(nextPinned);
    rootState.pinned = nextPinned;
  };

  return (
    <UnoIcon
      active={rootState.pinned}
      className={clsx({ "-rotate-45": !rootState.pinned })}
      hoverable
      name="i-lets-icons:pin"
      onClick={() => {
        void togglePin();
      }}
      size={16}
    />
  );
};

export default WindowPin;
