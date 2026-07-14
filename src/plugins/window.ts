import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  cursorPosition,
  PhysicalPosition,
  PhysicalSize,
  primaryMonitor,
} from "@tauri-apps/api/window";
import { LISTEN_KEY, WINDOW_LABEL } from "@/constants";
import { revealEdgeAutoHideWindow } from "@/plugins/edgeAutoHide";
import { clipboardStore } from "@/stores/clipboard";
import type { WindowLabel } from "@/types/plugin";
import { isLinux } from "@/utils/is";
import { getCursorMonitor } from "@/utils/monitor";

const COMMAND = {
  HIDE_WINDOW: "plugin:pastex-window|hide_window",
  SHOW_TASKBAR_ICON: "plugin:pastex-window|show_taskbar_icon",
  SHOW_WINDOW: "plugin:pastex-window|show_window",
};

const MAIN_WINDOW_DEFAULT_SIZE = {
  height: 700,
  width: 420,
} as const;
const MAIN_WINDOW_MIN_SIZE = {
  height: 460,
  width: 360,
} as const;

const WINDOW_MARGIN = 16;

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(value, max));
};
/**
 * 显示窗口
 */
export const showWindow = (label?: WindowLabel) => {
  if (label) {
    emit(LISTEN_KEY.SHOW_WINDOW, label);
  } else {
    void showCurrentWindow();
  }
};

const prepareMainWindowPosition = async () => {
  const appWindow = getCurrentWebviewWindow();
  const { window } = clipboardStore;

  if (appWindow.label !== WINDOW_LABEL.MAIN) return;
  if (window.style === "standard") {
    const targetMonitor =
      window.position === "follow"
        ? ((await getCursorMonitor()) ??
          (await primaryMonitor().catch(() => null)))
        : await primaryMonitor().catch(() => null);

    if (!targetMonitor) return;

    const { position, size, workArea } = targetMonitor;
    const areaPosition = workArea?.position ?? position;
    const areaSize = workArea?.size ?? size;
    const maxWidth = Math.max(1, areaSize.width - WINDOW_MARGIN * 2);
    const maxHeight = Math.max(1, areaSize.height - WINDOW_MARGIN * 2);
    const minWidth = Math.min(MAIN_WINDOW_MIN_SIZE.width, maxWidth);
    const minHeight = Math.min(MAIN_WINDOW_MIN_SIZE.height, maxHeight);
    const currentSize = await appWindow.outerSize().catch(() => null);
    const fallbackWidth = MAIN_WINDOW_DEFAULT_SIZE.width;
    const fallbackHeight = MAIN_WINDOW_DEFAULT_SIZE.height;
    const currentWidth = Math.max(1, currentSize?.width ?? fallbackWidth);
    const currentHeight = Math.max(1, currentSize?.height ?? fallbackHeight);
    const width = clamp(currentWidth, minWidth, maxWidth);
    const height = clamp(currentHeight, minHeight, maxHeight);
    const shouldResize = width !== currentWidth || height !== currentHeight;

    await appWindow.setMinSize(new PhysicalSize(minWidth, minHeight));

    if (shouldResize) {
      await appWindow.setSize(new PhysicalSize(width, height));
      const appliedSize = await appWindow.outerSize().catch(() => null);
      const notApplied =
        !appliedSize ||
        Math.abs(appliedSize.width - width) > 1 ||
        Math.abs(appliedSize.height - height) > 1;

      if (notApplied) {
        // 某些系统窗口状态下第一次设置会被回滚，二次设置确保目标尺寸落地。
        await appWindow.setSize(new PhysicalSize(width, height));
      }
    }

    if (window.position === "remember") {
      return;
    }

    let x = areaPosition.x + Math.floor((areaSize.width - width) / 2);
    let y = areaPosition.y + Math.floor((areaSize.height - height) / 2);

    if (window.position === "follow") {
      const cursorPoint = await cursorPosition().catch(() => null);
      const minX = areaPosition.x;
      const minY = areaPosition.y;
      const maxX = areaPosition.x + areaSize.width - width;
      const maxY = areaPosition.y + areaSize.height - height;

      if (cursorPoint) {
        x = clamp(Math.round(cursorPoint.x - width / 2), minX, maxX);
        y = clamp(Math.round(cursorPoint.y + 12), minY, maxY);
      }
    }

    await appWindow.setPosition(
      new PhysicalPosition(Math.round(x), Math.round(y)),
    );

    return;
  }

  if (window.style === "dock") {
    const monitor =
      (await getCursorMonitor()) ?? (await primaryMonitor().catch(() => null));

    if (!monitor) return;

    const area = monitor.workArea ?? {
      position: monitor.position,
      size: monitor.size,
    };
    const { width, height } = area.size;
    const { x, y: top } = area.position;
    const windowHeight = 400;
    const y = top + height - windowHeight;

    await appWindow.setSize(new PhysicalSize(width, windowHeight));
    await appWindow.setPosition(new PhysicalPosition(x, y));
  }
};

const showCurrentWindow = async () => {
  await revealEdgeAutoHideWindow();
  await prepareMainWindowPosition();
  await invoke(COMMAND.SHOW_WINDOW);
  // 有些平台在隐藏窗口状态下 setSize 不稳定，显示后再应用一次确保最终尺寸生效。
  await prepareMainWindowPosition();
  await revealEdgeAutoHideWindow();
};

/**
 * 隐藏窗口
 */
export const hideWindow = () => {
  invoke(COMMAND.HIDE_WINDOW);
};

/**
 * 切换窗口的显示和隐藏
 */
export const toggleWindowVisible = async () => {
  const appWindow = getCurrentWebviewWindow();

  let focused = await appWindow.isFocused();

  if (isLinux) {
    focused = await appWindow.isVisible();
  }

  if (focused) {
    return hideWindow();
  }

  if (appWindow.label === WINDOW_LABEL.MAIN) {
    // 激活时回到顶部
    if (clipboardStore.window.backTop) {
      await emit(LISTEN_KEY.ACTIVATE_BACK_TOP);
    }
  }

  await showCurrentWindow();
};

/**
 * 显示任务栏图标
 */
export const showTaskbarIcon = (visible = true) => {
  invoke(COMMAND.SHOW_TASKBAR_ICON, { visible });
};
