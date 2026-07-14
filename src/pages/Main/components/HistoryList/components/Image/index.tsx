import { convertFileSrc } from "@tauri-apps/api/core";
import { Image as AntImage } from "antd";
import { type FC, useState } from "react";
import LocalImage from "@/components/LocalImage";
import UnoIcon from "@/components/UnoIcon";
import type { DatabaseSchemaHistory } from "@/types/database";

const Image: FC<DatabaseSchemaHistory<"image">> = (props) => {
  const { value } = props;
  const [preview, setPreview] = useState(false);

  return (
    <>
      <div className="group relative inline-block">
        <LocalImage className="block max-h-21.5 rounded" src={value} />

        <div className="absolute inset-0 hidden items-center justify-center rounded bg-black/50 opacity-0 transition-opacity duration-300 group-hover:flex group-hover:opacity-100">
          <UnoIcon
            className="cursor-pointer text-2xl text-white hover:scale-110 active:scale-95"
            name="i-lucide:eye"
            onClick={(event) => {
              event.stopPropagation();
              setPreview(true);
            }}
          />
        </div>
      </div>

      <div className="hidden">
        <AntImage
          preview={{
            onVisibleChange: (value) => {
              setPreview(value);
            },
            src: convertFileSrc(value),
            visible: preview,
          }}
        />
      </div>
    </>
  );
};

export default Image;
