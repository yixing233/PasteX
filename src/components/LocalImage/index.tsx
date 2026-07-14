import { convertFileSrc } from "@tauri-apps/api/core";
import type { FC, HTMLAttributes } from "react";

interface LocalImage extends HTMLAttributes<HTMLImageElement> {
  src: string;
}

const normalizeLocalSrc = (src: string) => {
  if (!src) return src;

  const trimmed = src.trim();
  if (!trimmed) return trimmed;

  // 已经是可访问 URL，直接使用
  if (
    /^(https?:|data:|blob:)/i.test(trimmed) ||
    trimmed.startsWith("http://asset.localhost")
  ) {
    return trimmed;
  }

  let resolved = trimmed;

  // 兼容被 encodeURIComponent 过的本地路径
  try {
    resolved = decodeURIComponent(resolved);
  } catch {
    // ignore invalid URI sequence
  }

  if (resolved.startsWith("file://")) {
    resolved = resolved.replace(/^file:\/\/+/, "");
  }

  return convertFileSrc(resolved);
};

const LocalImage: FC<LocalImage> = (props) => {
  const { src, ...rest } = props;

  return <img {...rest} src={normalizeLocalSrc(src)} />;
};

export default LocalImage;
