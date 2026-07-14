import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  availableMonitors,
  cursorPosition,
  type Monitor,
  monitorFromPoint,
  primaryMonitor,
} from "@tauri-apps/api/window";
import { useEffect } from "react";
import { useSnapshot } from "valtio";
import type { State } from "@/pages/Main";
import { registerEdgeAutoHideController } from "@/plugins/edgeAutoHide";
import { clipboardStore } from "@/stores/clipboard";
import {
  canCollapseOutsideWorkArea,
  type DockEdge,
  detectDockEdge,
  getCollapsedEdgePosition,
  type WindowPoint,
  type WindowRect,
  type WindowSize,
} from "@/utils/edgeAutoHide";
import { getCursorMonitor } from "@/utils/monitor";

const appWindow = getCurrentWebviewWindow();
const EDGE_THRESHOLD = 12;
const VISIBLE_STRIP = 16;
const COLLAPSE_DELAY = 450;
const MOVE_SETTLE_DELAY = 260;
const ANIMATION_DURATION = 180;
const ANIMATION_FRAME = 15;

interface DockState {
  edge: DockEdge;
  expandedPosition: WindowPoint;
  size: WindowSize;
  visibleStrip: number;
  workArea: WindowRect;
}

const getWorkArea = (monitor: Monitor): WindowRect => {
  const area = monitor.workArea ?? {
    position: monitor.position,
    size: monitor.size,
  };

  return {
    height: area.size.height,
    width: area.size.width,
    x: area.position.x,
    y: area.position.y,
  };
};

const getMonitorArea = (monitor: Monitor): WindowRect => ({
  height: monitor.size.height,
  width: monitor.size.width,
  x: monitor.position.x,
  y: monitor.position.y,
});

const isSameArea = (first: WindowRect, second: WindowRect) =>
  first.x === second.x &&
  first.y === second.y &&
  first.width === second.width &&
  first.height === second.height;

export const useEdgeAutoHide = (rootState: State) => {
  const { window: windowSettings } = useSnapshot(clipboardStore);
  const enabled =
    windowSettings.edgeAutoHide &&
    windowSettings.position === "remember" &&
    windowSettings.style === "standard";

  useEffect(() => {
    if (appWindow.label !== "main" || !enabled) {
      rootState.edgeDocked = false;
      return;
    }

    let disposed = false;
    let collapsed = false;
    let dockState: DockState | null = null;
    let collapseTimer: ReturnType<typeof setTimeout> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let internalMoveTargets: WindowPoint[] = [];
    let lastExternalMoveAt = 0;
    let pointerInside = true;
    let restoreAlwaysOnTop = false;
    let desiredCollapsed = false;
    let detectionVersion = 0;
    let transitionQueue: Promise<void> = Promise.resolve();
    const unlisteners: Array<() => void> = [];

    const clearCollapseTimer = () => {
      if (collapseTimer) clearTimeout(collapseTimer);
      collapseTimer = undefined;
    };

    const moveWindow = async (position: WindowPoint) => {
      const target = {
        x: Math.round(position.x),
        y: Math.round(position.y),
      };
      internalMoveTargets.push(target);
      if (internalMoveTargets.length > 48) {
        internalMoveTargets = internalMoveTargets.slice(-48);
      }

      try {
        await appWindow.setPosition(new PhysicalPosition(target.x, target.y));
      } catch (error) {
        internalMoveTargets = internalMoveTargets.filter(
          (item) => item !== target,
        );
        throw error;
      }
    };

    const animateWindow = async (
      target: WindowPoint,
      shouldContinue: () => boolean,
    ) => {
      const start = await appWindow.outerPosition().catch(() => null);
      if (!start) return false;
      if (
        Math.abs(start.x - target.x) <= 1 &&
        Math.abs(start.y - target.y) <= 1
      ) {
        return shouldContinue();
      }

      const frameCount = Math.max(
        2,
        Math.round(ANIMATION_DURATION / ANIMATION_FRAME),
      );
      const frameDelay = ANIMATION_DURATION / frameCount;

      for (let frame = 1; frame <= frameCount; frame += 1) {
        if (!shouldContinue()) return false;

        const progress = frame / frameCount;
        const eased = 1 - (1 - progress) ** 3;
        const nextPosition = {
          x: start.x + (target.x - start.x) * eased,
          y: start.y + (target.y - start.y) * eased,
        };

        try {
          await moveWindow(nextPosition);
        } catch {
          return false;
        }

        if (frame < frameCount) {
          await new Promise((resolve) => setTimeout(resolve, frameDelay));
        }
      }

      return shouldContinue();
    };

    const queueTransition = (task: () => Promise<void>) => {
      const next = transitionQueue.then(task, task);
      transitionQueue = next.catch(() => undefined);
      return next;
    };

    const expand = async (focus = false) => {
      desiredCollapsed = false;
      clearCollapseTimer();

      return queueTransition(async () => {
        collapsed = false;
        if (dockState) {
          let expanded = await animateWindow(
            dockState.expandedPosition,
            () => !desiredCollapsed,
          );
          if (!expanded && !desiredCollapsed) {
            expanded = await moveWindow(dockState.expandedPosition)
              .then(() => true)
              .catch(() => false);
          }
          if (!expanded) return;
        }
        rootState.edgeCollapsed = false;

        if (restoreAlwaysOnTop) {
          restoreAlwaysOnTop = false;
          await appWindow.setAlwaysOnTop(false).catch(() => undefined);
        }

        if (focus) {
          await appWindow.setFocus().catch(() => undefined);
        }
      });
    };

    const collapse = async () => {
      if (!dockState || pointerInside || disposed) {
        desiredCollapsed = false;
        return;
      }
      desiredCollapsed = true;

      return queueTransition(async () => {
        const targetDock = dockState;
        const canContinue = () =>
          desiredCollapsed &&
          !disposed &&
          !pointerInside &&
          !collapsed &&
          dockState === targetDock &&
          Boolean(targetDock);

        if (!canContinue() || !targetDock) return;

        const visible = await appWindow.isVisible().catch(() => false);
        if (!visible || !canContinue()) return;

        const alwaysOnTop = await appWindow.isAlwaysOnTop().catch(() => false);
        if (!canContinue()) return;

        const madeAlwaysOnTop = !alwaysOnTop;
        if (madeAlwaysOnTop) {
          await appWindow.setAlwaysOnTop(true).catch(() => undefined);
        }

        if (!canContinue()) {
          if (madeAlwaysOnTop) {
            await appWindow.setAlwaysOnTop(false).catch(() => undefined);
          }
          return;
        }

        restoreAlwaysOnTop = restoreAlwaysOnTop || madeAlwaysOnTop;
        rootState.edgeCollapsed = true;
        const collapsedPosition = getCollapsedEdgePosition(
          targetDock.edge,
          targetDock.expandedPosition,
          targetDock.size,
          targetDock.workArea,
          targetDock.visibleStrip,
        );
        const retracted = await animateWindow(collapsedPosition, canContinue);
        if (!retracted) {
          if (restoreAlwaysOnTop) {
            restoreAlwaysOnTop = false;
            await appWindow.setAlwaysOnTop(false).catch(() => undefined);
          }
          if (desiredCollapsed) {
            void expand(false);
          }
          return;
        }
        collapsed = true;
      });
    };

    const scheduleCollapse = (delay = COLLAPSE_DELAY) => {
      clearCollapseTimer();
      collapseTimer = setTimeout(() => {
        const elapsed = Date.now() - lastExternalMoveAt;
        if (elapsed < MOVE_SETTLE_DELAY) {
          scheduleCollapse(MOVE_SETTLE_DELAY - elapsed);
          return;
        }

        void collapse();
      }, delay);
    };

    const clearDockState = async (requestVersion?: number) => {
      await expand(false);
      if (requestVersion !== undefined && requestVersion !== detectionVersion) {
        return;
      }
      dockState = null;
      rootState.edgeDocked = false;
      rootState.edgeCollapsed = false;
      rootState.edgeDockEdge = undefined;
    };

    const getTargetMonitor = async (
      position: WindowPoint,
      size: WindowSize,
    ) => {
      const center = {
        x: Math.round(position.x + size.width / 2),
        y: Math.round(position.y + size.height / 2),
      };

      return (
        (await monitorFromPoint(center.x, center.y).catch(() => null)) ??
        (await getCursorMonitor()) ??
        (await primaryMonitor().catch(() => null))
      );
    };

    const getPointerInside = async (
      position: WindowPoint,
      size: WindowSize,
    ) => {
      const cursor = await cursorPosition().catch(() => null);
      if (!cursor) return pointerInside;

      return (
        cursor.x >= position.x &&
        cursor.x < position.x + size.width &&
        cursor.y >= position.y &&
        cursor.y < position.y + size.height
      );
    };

    const detectAndSnap = async () => {
      if (disposed || collapsed) return;
      const requestVersion = ++detectionVersion;
      const isCurrent = () =>
        !disposed &&
        !collapsed &&
        !desiredCollapsed &&
        requestVersion === detectionVersion;

      const [position, size] = await Promise.all([
        appWindow.outerPosition(),
        appWindow.outerSize(),
      ]).catch(() => []);

      if (!position || !size || !isCurrent()) return;

      const targetMonitor = await getTargetMonitor(position, size);
      if (!isCurrent()) return;
      if (!targetMonitor) {
        await clearDockState(requestVersion);
        return;
      }

      const workArea = getWorkArea(targetMonitor);
      const scaleFactor = targetMonitor.scaleFactor || 1;
      const threshold = Math.max(1, Math.round(EDGE_THRESHOLD * scaleFactor));
      const visibleStrip = Math.max(2, Math.round(VISIBLE_STRIP * scaleFactor));
      const monitors = await availableMonitors().catch(() => []);
      if (!isCurrent()) return;
      const monitorArea = getMonitorArea(targetMonitor);
      const otherMonitorAreas = monitors
        .map(getMonitorArea)
        .filter((area) => !isSameArea(area, monitorArea));
      const nextDock = detectDockEdge(
        position,
        size,
        workArea,
        threshold,
        (edge, expandedPosition) =>
          canCollapseOutsideWorkArea(
            edge,
            expandedPosition,
            size,
            workArea,
            otherMonitorAreas,
            visibleStrip,
          ),
      );

      if (!isCurrent()) return;
      if (!nextDock) {
        await clearDockState(requestVersion);
        return;
      }

      dockState = {
        edge: nextDock.edge,
        expandedPosition: nextDock.position,
        size,
        visibleStrip,
        workArea,
      };
      rootState.edgeDocked = true;
      rootState.edgeCollapsed = false;
      rootState.edgeDockEdge = nextDock.edge;

      if (
        position.x !== nextDock.position.x ||
        position.y !== nextDock.position.y
      ) {
        await moveWindow(nextDock.position).catch(() => undefined);
      }

      if (!isCurrent()) return;
      const nextPointerInside = await getPointerInside(nextDock.position, size);
      if (!isCurrent()) return;
      pointerInside = nextPointerInside;
      if (!pointerInside) scheduleCollapse();
    };

    const handleExternalWindowChange = () => {
      if (collapsed || restoreAlwaysOnTop || desiredCollapsed) {
        void expand(false);
      } else {
        clearCollapseTimer();
      }
      detectionVersion += 1;
      lastExternalMoveAt = Date.now();
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        void detectAndSnap();
      }, MOVE_SETTLE_DELAY);
    };

    const handleWindowMoved = ({ payload }: { payload: WindowPoint }) => {
      const internalTargetIndex = internalMoveTargets.findIndex(
        (target) =>
          Math.abs(payload.x - target.x) <= 1 &&
          Math.abs(payload.y - target.y) <= 1,
      );
      if (internalTargetIndex >= 0) {
        internalMoveTargets.splice(internalTargetIndex, 1);
        return;
      }

      internalMoveTargets = [];
      if (dockState && !collapsed) {
        dockState.expandedPosition = {
          x: payload.x,
          y: payload.y,
        };
      }

      handleExternalWindowChange();
    };

    const handleWindowResized = ({ payload }: { payload: WindowSize }) => {
      if (dockState && !collapsed) {
        dockState.size = {
          height: payload.height,
          width: payload.width,
        };
      }

      handleExternalWindowChange();
    };

    const handleMouseEnter = () => {
      pointerInside = true;
      clearCollapseTimer();
      void expand(false);
    };

    const handleMouseLeave = () => {
      pointerInside = false;
      scheduleCollapse();
    };

    const unregisterController = registerEdgeAutoHideController({
      getRestorePosition: () => dockState?.expandedPosition ?? null,
      reveal: () => expand(false),
    });

    document.documentElement.addEventListener("mouseenter", handleMouseEnter);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);

    const setup = async () => {
      const nextUnlisteners = (
        await Promise.all([
          appWindow.onMoved(handleWindowMoved).catch(() => undefined),
          appWindow.onResized(handleWindowResized).catch(() => undefined),
          appWindow
            .onFocusChanged(({ payload }) => {
              if (!payload) {
                pointerInside = false;
                void detectAndSnap().finally(() => {
                  scheduleCollapse(150);
                });
              }
            })
            .catch(() => undefined),
        ])
      ).filter((unlisten): unlisten is () => void => Boolean(unlisten));

      if (disposed) {
        nextUnlisteners.forEach((unlisten) => {
          unlisten();
        });
        return;
      }

      unlisteners.push(...nextUnlisteners);
      settleTimer = setTimeout(() => {
        void detectAndSnap();
      }, MOVE_SETTLE_DELAY);
    };

    void setup();

    return () => {
      disposed = true;
      detectionVersion += 1;
      desiredCollapsed = false;
      clearCollapseTimer();
      if (settleTimer) clearTimeout(settleTimer);
      document.documentElement.removeEventListener(
        "mouseenter",
        handleMouseEnter,
      );
      document.documentElement.removeEventListener(
        "mouseleave",
        handleMouseLeave,
      );
      unlisteners.forEach((unlisten) => {
        unlisten();
      });
      unregisterController();
      rootState.edgeDocked = false;
      rootState.edgeCollapsed = false;
      rootState.edgeDockEdge = undefined;
      void expand(false);
    };
  }, [enabled, rootState]);
};
