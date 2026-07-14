import clsx from "clsx";
import { useContext } from "react";
import { MainContext } from "../..";

const EdgeAutoHideHandle = () => {
  const { rootState } = useContext(MainContext);
  const { edgeCollapsed, edgeDockEdge } = rootState;

  if (!edgeCollapsed || !edgeDockEdge) return null;

  return (
    <div
      aria-hidden
      className={clsx(
        "pointer-events-none fixed z-100 bg-primary/85 shadow-[0_0_14px_rgba(22,119,255,0.75)]",
        {
          "-translate-x-1/2 bottom-0 left-1/2 h-3 w-20 rounded-t-lg":
            edgeDockEdge === "top",
          "-translate-x-1/2 top-0 left-1/2 h-3 w-20 rounded-b-lg":
            edgeDockEdge === "bottom",
          "-translate-y-1/2 top-1/2 left-0 h-20 w-3 rounded-r-lg":
            edgeDockEdge === "right",
          "-translate-y-1/2 top-1/2 right-0 h-20 w-3 rounded-l-lg":
            edgeDockEdge === "left",
        },
      )}
    />
  );
};

export default EdgeAutoHideHandle;
