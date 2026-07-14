import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import type { Event } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useReactive } from "ahooks";
import { useEffect } from "react";
import { getEdgeAutoHideRestorePosition } from "@/plugins/edgeAutoHide";
import { getSaveWindowStatePath } from "@/utils/path";
import { useTauriFocus } from "./useTauriFocus";

const appWindow = getCurrentWebviewWindow();
const { label } = appWindow;

const DEFAULT_WINDOW_SIZE = {
  main: {
    height: 700,
    width: 420,
  },
  preference: {
    height: 480,
    width: 700,
  },
} as const;

const MIN_WINDOW_SIZE = {
  main: {
    height: 460,
    width: 360,
  },
  preference: {
    height: 480,
    width: 700,
  },
} as const;

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

export const useWindowState = () => {
  const state = useReactive<Partial<PhysicalPosition & PhysicalSize>>({});

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      const nextUnlisteners = (
        await Promise.all([
          appWindow.onMoved(onChange).catch(() => undefined),
          appWindow.onResized(onChange).catch(() => undefined),
        ])
      ).filter((unlisten): unlisten is () => void => Boolean(unlisten));

      if (disposed) {
        nextUnlisteners.forEach((unlisten) => {
          unlisten();
        });
        return;
      }

      unlisteners.push(...nextUnlisteners);
    };

    void setup();

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => {
        unlisten();
      });
    };
  }, []);

  useTauriFocus({
    onBlur() {
      saveState();
    },
  });

  const onChange = async (event: Event<PhysicalPosition | PhysicalSize>) => {
    const minimized = await appWindow.isMinimized();

    if (minimized) return;

    Object.assign(state, event.payload);
  };

  const getSavedStates = async () => {
    const path = await getSaveWindowStatePath();

    const existed = await exists(path);

    if (!existed) return {};

    try {
      const states = await readTextFile(path);
      const parsed = JSON.parse(states);

      if (!parsed || typeof parsed !== "object") {
        return {};
      }

      return parsed as Record<string, Partial<PhysicalPosition & PhysicalSize>>;
    } catch {
      return {};
    }
  };

  const saveState = async () => {
    const path = await getSaveWindowStatePath();

    const states = await getSavedStates();

    const restorePosition =
      label === "main" ? getEdgeAutoHideRestorePosition() : null;
    states[label] = restorePosition ? { ...state, ...restorePosition } : state;

    return writeTextFile(path, JSON.stringify(states, null, 2));
  };

  const restoreState = async () => {
    const states = await getSavedStates();

    const savedState = states[label];

    if (savedState) {
      Object.assign(state, savedState);
    }

    const { x, y, width, height } = state;
    const minSize =
      label in MIN_WINDOW_SIZE
        ? MIN_WINDOW_SIZE[label as keyof typeof MIN_WINDOW_SIZE]
        : undefined;

    if (minSize) {
      await appWindow.setMinSize(
        new PhysicalSize(minSize.width, minSize.height),
      );
    }

    const validWidth =
      isFiniteNumber(width) &&
      width > 0 &&
      (!minSize || width >= minSize.width);
    const validHeight =
      isFiniteNumber(height) &&
      height > 0 &&
      (!minSize || height >= minSize.height);

    if (isFiniteNumber(x) && isFiniteNumber(y)) {
      await appWindow.setPosition(new PhysicalPosition(x, y));
    }

    if (validWidth && validHeight) {
      await appWindow.setSize(new PhysicalSize(width, height));
      return;
    }

    if (label in DEFAULT_WINDOW_SIZE) {
      const defaultSize =
        DEFAULT_WINDOW_SIZE[label as keyof typeof DEFAULT_WINDOW_SIZE];
      await appWindow.setSize(
        new PhysicalSize(defaultSize.width, defaultSize.height),
      );
    }
  };

  return {
    restoreState,
    saveState,
  };
};
