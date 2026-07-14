import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useMount, useUnmount } from "ahooks";
import { debounce } from "es-toolkit";
import { useRef } from "react";
import { isMac } from "@/utils/is";

interface Props {
  onFocus?: () => void;
  onBlur?: () => void;
}

export const useTauriFocus = (props: Props) => {
  const { onFocus, onBlur } = props;
  const unlistenRef = useRef(() => {});
  const onFocusRef = useRef<Props["onFocus"]>();
  const onBlurRef = useRef<Props["onBlur"]>();

  onFocusRef.current = onFocus;
  onBlurRef.current = onBlur;

  useMount(async () => {
    const appWindow = getCurrentWebviewWindow();

    const wait = isMac ? 0 : 100;

    const debounced = debounce(({ payload }) => {
      if (payload) {
        onFocusRef.current?.();
      } else {
        onBlurRef.current?.();
      }
    }, wait);

    unlistenRef.current = await appWindow.onFocusChanged(debounced);
  });

  useUnmount(unlistenRef.current);
};
