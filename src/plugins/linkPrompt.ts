import { LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { primaryMonitor } from "@tauri-apps/api/window";
import { getCursorMonitor } from "@/utils/monitor";
import { normalizeURL } from "@/utils/url";

const LINK_PROMPT_WINDOW_LABEL = "link-open-prompt";
const LINK_PROMPT_WINDOW_WIDTH = 360;
const LINK_PROMPT_WINDOW_HEIGHT = 84;
const LINK_PROMPT_WINDOW_MARGIN = 16;
export const LINK_PROMPT_OPEN_EVENT = "link-open-prompt:open";

const getCurrentThemeIsDark = () => {
  if (typeof document === "undefined") return false;

  return document.documentElement.classList.contains("dark");
};

const getPromptWorkArea = async () => {
  const monitor =
    (await getCursorMonitor()) ?? (await primaryMonitor().catch(() => null));
  const areaPosition = monitor?.workArea?.position ??
    monitor?.position ?? { x: 0, y: 0 };
  const areaSize = monitor?.workArea?.size ?? monitor?.size;

  if (!monitor || !areaSize) return;

  return {
    areaPosition,
    areaSize,
    margin: Math.round(LINK_PROMPT_WINDOW_MARGIN * monitor.scaleFactor),
    scaleFactor: monitor.scaleFactor,
  };
};

const getPromptWindowPosition = (
  areaPosition: { x: number; y: number },
  areaSize: { width: number; height: number },
  windowSize: { width: number; height: number },
  margin: number,
) => {
  const { width, height } = windowSize;

  const x = areaPosition.x + Math.max(0, areaSize.width - width - margin);
  const y = areaPosition.y + Math.max(0, areaSize.height - height - margin);

  return { x, y };
};

const setPromptWindowPosition = async (
  promptWindow: WebviewWindow,
  windowSize?: { width: number; height: number },
  workArea?: Awaited<ReturnType<typeof getPromptWorkArea>>,
) => {
  const targetWorkArea = workArea ?? (await getPromptWorkArea());
  const currentSize =
    windowSize ?? (await promptWindow.outerSize().catch(() => undefined));

  if (!targetWorkArea || !currentSize) return false;

  const { x, y } = getPromptWindowPosition(
    targetWorkArea.areaPosition,
    targetWorkArea.areaSize,
    currentSize,
    targetWorkArea.margin,
  );

  await promptWindow.setPosition(new PhysicalPosition(x, y));

  return true;
};

export const positionLinkPromptWindow = async (
  promptWindow?: WebviewWindow,
) => {
  const targetWindow =
    promptWindow ?? (await WebviewWindow.getByLabel(LINK_PROMPT_WINDOW_LABEL));

  if (!targetWindow) return false;

  return setPromptWindowPosition(targetWindow);
};

export const resizeLinkPromptWindow = async (height: number) => {
  const promptWindow = await WebviewWindow.getByLabel(LINK_PROMPT_WINDOW_LABEL);

  if (!promptWindow) return false;

  const workArea = await getPromptWorkArea();

  if (!workArea) return false;

  const currentSize = await promptWindow.outerSize();
  const targetSize = {
    height: Math.round(height * workArea.scaleFactor),
    width: Math.round(LINK_PROMPT_WINDOW_WIDTH * workArea.scaleFactor),
  };
  const growing =
    targetSize.height > currentSize.height ||
    targetSize.width > currentSize.width;

  // 放大时先定位再改尺寸，缩小时先缩小再定位，避免中间状态越过工作区边界。
  if (growing) {
    await setPromptWindowPosition(promptWindow, targetSize, workArea);
  }

  if (
    Math.abs(currentSize.height - targetSize.height) > 1 ||
    Math.abs(currentSize.width - targetSize.width) > 1
  ) {
    await promptWindow.setSize(
      new LogicalSize(LINK_PROMPT_WINDOW_WIDTH, height),
    );
  }

  const appliedSize = await promptWindow.outerSize().catch(() => targetSize);
  await setPromptWindowPosition(promptWindow, appliedSize, workArea);

  return true;
};

export const preloadLinkPromptWindow = async () => {
  const existed = await WebviewWindow.getByLabel(LINK_PROMPT_WINDOW_LABEL);

  if (existed) return true;

  const workArea = await getPromptWorkArea();
  if (!workArea) return false;

  const initialPosition = getPromptWindowPosition(
    workArea.areaPosition,
    workArea.areaSize,
    {
      height: Math.round(LINK_PROMPT_WINDOW_HEIGHT * workArea.scaleFactor),
      width: Math.round(LINK_PROMPT_WINDOW_WIDTH * workArea.scaleFactor),
    },
    workArea.margin,
  );

  const created = new WebviewWindow(LINK_PROMPT_WINDOW_LABEL, {
    alwaysOnTop: true,
    decorations: false,
    focus: false,
    height: LINK_PROMPT_WINDOW_HEIGHT,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    // 预加载阶段不传 url/dark 参数，由后续更新事件注入
    url: "index.html#/link-open-prompt",
    visible: false,
    width: LINK_PROMPT_WINDOW_WIDTH,
    x: initialPosition.x,
    y: initialPosition.y,
  });

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 1200);

    void created.once("tauri://created", () => {
      clearTimeout(timeout);
      resolve();
    });

    // 预加载失败忽略错误，不影响主流程
    void created.once("tauri://error", () => {
      clearTimeout(timeout);
      resolve();
    });
  });

  await positionLinkPromptWindow(created);

  return true;
};

export const openLinkPromptWindow = async (url: string) => {
  const safeUrl = normalizeURL(url);
  if (!safeUrl) return false;
  const isDark = getCurrentThemeIsDark();

  const workArea = await getPromptWorkArea();
  if (!workArea) return false;
  const initialPosition = getPromptWindowPosition(
    workArea.areaPosition,
    workArea.areaSize,
    {
      height: Math.round(LINK_PROMPT_WINDOW_HEIGHT * workArea.scaleFactor),
      width: Math.round(LINK_PROMPT_WINDOW_WIDTH * workArea.scaleFactor),
    },
    workArea.margin,
  );
  const existed = await WebviewWindow.getByLabel(LINK_PROMPT_WINDOW_LABEL);

  if (existed) {
    await existed.emit("link-open-prompt:update", { isDark, url: safeUrl });
    await positionLinkPromptWindow(existed);
    await existed.show();
    await positionLinkPromptWindow(existed);
    await existed.setFocus().catch(() => undefined);
    return true;
  }

  const created = new WebviewWindow(LINK_PROMPT_WINDOW_LABEL, {
    alwaysOnTop: true,
    decorations: false,
    focus: true,
    height: LINK_PROMPT_WINDOW_HEIGHT,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    url:
      `index.html#/link-open-prompt?url=${encodeURIComponent(safeUrl)}` +
      `&dark=${isDark ? "1" : "0"}`,
    visible: false,
    width: LINK_PROMPT_WINDOW_WIDTH,
    x: initialPosition.x,
    y: initialPosition.y,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, 1200);

    void created.once("tauri://created", () => {
      clearTimeout(timeout);
      resolve();
    });

    void created.once("tauri://error", (error) => {
      clearTimeout(timeout);
      const payload =
        error && typeof error === "object" && "payload" in error
          ? (error as { payload?: unknown }).payload
          : error;

      const message =
        typeof payload === "string"
          ? payload
          : (() => {
              try {
                return JSON.stringify(payload);
              } catch {
                return String(payload);
              }
            })();

      reject(new Error(message || "failed to create link prompt window"));
    });
  });

  // 先按实际窗口尺寸定位，再显示，避免首次创建时在多屏/DPI 环境下闪到屏幕外。
  await positionLinkPromptWindow(created);
  await created.show();
  await positionLinkPromptWindow(created);
  await created.setFocus().catch(() => undefined);

  return true;
};

export const openCurrentLinkPrompt = async () => {
  const promptWindow = await WebviewWindow.getByLabel(LINK_PROMPT_WINDOW_LABEL);

  if (!promptWindow) return false;

  await promptWindow.emit(LINK_PROMPT_OPEN_EVENT);

  return true;
};
