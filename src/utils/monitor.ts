import {
  availableMonitors,
  currentMonitor,
  cursorPosition,
  monitorFromPoint,
} from "@tauri-apps/api/window";

export const getCursorMonitor = async () => {
  const cursorPoint = await cursorPosition().catch(() => null);
  if (!cursorPoint) {
    return (await currentMonitor().catch(() => null)) ??
      (await availableMonitors().catch(() => [])).at(0) ??
      null;
  }

  const monitors = await availableMonitors().catch(() => []);
  const monitor =
    (await monitorFromPoint(cursorPoint.x, cursorPoint.y).catch(() => null)) ??
    (await currentMonitor().catch(() => null)) ??
    monitors.at(0) ??
    null;

  return monitor;
};
