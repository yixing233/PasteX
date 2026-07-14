import { useAsyncEffect, useReactive } from "ahooks";
import type { FC } from "react";
import { icon } from "tauri-plugin-fs-pro-api";
import LocalImage from "@/components/LocalImage";

interface SourceAppIconProps {
  path?: string;
}

const SourceAppIcon: FC<SourceAppIconProps> = ({ path }) => {
  const state = useReactive({ src: "" });

  useAsyncEffect(async () => {
    state.src = "";
    if (!path) return;

    state.src = await icon(path, { size: 64 }).catch(() => "");
  }, [path]);

  if (!state.src) return null;

  return <LocalImage className="h-3.5 w-3.5 shrink-0" src={state.src} />;
};

export default SourceAppIcon;
