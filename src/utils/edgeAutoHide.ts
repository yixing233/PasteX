export type DockEdge = "bottom" | "left" | "right" | "top";

export interface WindowPoint {
  x: number;
  y: number;
}

export interface WindowRect extends WindowPoint {
  height: number;
  width: number;
}

export interface WindowSize {
  height: number;
  width: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

export const getExpandedEdgePosition = (
  edge: DockEdge,
  position: WindowPoint,
  size: WindowSize,
  workArea: WindowRect,
): WindowPoint => {
  const maxX = workArea.x + Math.max(0, workArea.width - size.width);
  const maxY = workArea.y + Math.max(0, workArea.height - size.height);
  const x = clamp(position.x, workArea.x, maxX);
  const y = clamp(position.y, workArea.y, maxY);

  switch (edge) {
    case "left":
      return { x: workArea.x, y };
    case "right":
      return { x: maxX, y };
    case "top":
      return { x, y: workArea.y };
    case "bottom":
      return { x, y: maxY };
  }
};

export const getCollapsedEdgePosition = (
  edge: DockEdge,
  expandedPosition: WindowPoint,
  size: WindowSize,
  workArea: WindowRect,
  visibleStrip: number,
): WindowPoint => {
  switch (edge) {
    case "left":
      return {
        x: workArea.x - size.width + visibleStrip,
        y: expandedPosition.y,
      };
    case "right":
      return {
        x: workArea.x + workArea.width - visibleStrip,
        y: expandedPosition.y,
      };
    case "top":
      return {
        x: expandedPosition.x,
        y: workArea.y - size.height + visibleStrip,
      };
    case "bottom":
      return {
        x: expandedPosition.x,
        y: workArea.y + workArea.height - visibleStrip,
      };
  }
};

const getHiddenRect = (
  edge: DockEdge,
  expandedPosition: WindowPoint,
  size: WindowSize,
  workArea: WindowRect,
  visibleStrip: number,
): WindowRect => {
  const hiddenWidth = Math.max(0, size.width - visibleStrip);
  const hiddenHeight = Math.max(0, size.height - visibleStrip);

  switch (edge) {
    case "left":
      return {
        height: size.height,
        width: hiddenWidth,
        x: workArea.x - hiddenWidth,
        y: expandedPosition.y,
      };
    case "right":
      return {
        height: size.height,
        width: hiddenWidth,
        x: workArea.x + workArea.width,
        y: expandedPosition.y,
      };
    case "top":
      return {
        height: hiddenHeight,
        width: size.width,
        x: expandedPosition.x,
        y: workArea.y - hiddenHeight,
      };
    case "bottom":
      return {
        height: hiddenHeight,
        width: size.width,
        x: expandedPosition.x,
        y: workArea.y + workArea.height,
      };
  }
};

const intersects = (first: WindowRect, second: WindowRect) => {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
};

export const canCollapseOutsideWorkArea = (
  edge: DockEdge,
  expandedPosition: WindowPoint,
  size: WindowSize,
  workArea: WindowRect,
  otherWorkAreas: readonly WindowRect[],
  visibleStrip: number,
) => {
  const hiddenRect = getHiddenRect(
    edge,
    expandedPosition,
    size,
    workArea,
    visibleStrip,
  );

  return !otherWorkAreas.some((area) => intersects(hiddenRect, area));
};

export const detectDockEdge = (
  position: WindowPoint,
  size: WindowSize,
  workArea: WindowRect,
  threshold: number,
  canUseEdge: (edge: DockEdge, position: WindowPoint) => boolean,
): { edge: DockEdge; position: WindowPoint } | null => {
  const right = workArea.x + workArea.width;
  const bottom = workArea.y + workArea.height;
  const candidates: Array<{ distance: number; edge: DockEdge }> = [
    {
      distance: Math.max(0, position.x - workArea.x),
      edge: "left",
    },
    {
      distance: Math.max(0, right - (position.x + size.width)),
      edge: "right",
    },
    {
      distance: Math.max(0, position.y - workArea.y),
      edge: "top",
    },
    {
      distance: Math.max(0, bottom - (position.y + size.height)),
      edge: "bottom",
    },
  ];

  for (const candidate of candidates.sort((a, b) => a.distance - b.distance)) {
    if (candidate.distance > threshold) return null;

    const expandedPosition = getExpandedEdgePosition(
      candidate.edge,
      position,
      size,
      workArea,
    );

    if (canUseEdge(candidate.edge, expandedPosition)) {
      return { edge: candidate.edge, position: expandedPosition };
    }
  }

  return null;
};
