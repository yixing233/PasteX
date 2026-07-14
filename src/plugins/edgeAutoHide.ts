import type { WindowPoint } from "@/utils/edgeAutoHide";

interface EdgeAutoHideController {
  getRestorePosition: () => WindowPoint | null;
  reveal: () => Promise<void>;
}

let controller: EdgeAutoHideController | null = null;

export const registerEdgeAutoHideController = (
  nextController: EdgeAutoHideController,
) => {
  controller = nextController;

  return () => {
    if (controller === nextController) {
      controller = null;
    }
  };
};

export const revealEdgeAutoHideWindow = async () => {
  await controller?.reveal();
};

export const getEdgeAutoHideRestorePosition = () => {
  return controller?.getRestorePosition() ?? null;
};
