import { openPath } from "@tauri-apps/plugin-opener";
import { Dropdown, Flex } from "antd";
import type { HookAPI } from "antd/es/modal/useModal";
import clsx from "clsx";
import { type FC, useContext } from "react";
import { Marker } from "react-mark.js";
import { useSnapshot } from "valtio";
import SafeHtml from "@/components/SafeHtml";
import UnoIcon from "@/components/UnoIcon";
import { LISTEN_KEY } from "@/constants";
import { useContextMenu } from "@/hooks/useContextMenu";
import { MainContext } from "@/pages/Main";
import { pasteToClipboard } from "@/plugins/clipboard";
import { clipboardStore } from "@/stores/clipboard";
import type { DatabaseSchemaHistory } from "@/types/database";
import { maskSensitiveText } from "@/utils/contentRules";
import { isImage, isLikelyLocalPath } from "@/utils/is";
import Files from "../Files";
import Header from "../Header";
import Image from "../Image";
import Rtf from "../Rtf";
import Text from "../Text";

export interface ItemProps {
  index: number;
  data: DatabaseSchemaHistory;
  deleteModal: HookAPI;
  handleNote: () => void;
  handleEdit: () => void;
}

const Item: FC<ItemProps> = (props) => {
  const { index, data, handleNote, handleEdit } = props;
  const { id, type, note, value } = data;
  const { rootState } = useContext(MainContext);
  const { content } = useSnapshot(clipboardStore);

  const handlePreview = () => {
    const isPathImage =
      type === "text" &&
      typeof value === "string" &&
      isLikelyLocalPath(value) &&
      isImage(value);

    if (type !== "image" && !isPathImage) return;

    openPath(value as string);
  };

  const handleNext = () => {
    const { list } = rootState;

    const nextItem = list[index + 1] ?? list[index - 1];

    rootState.activeId = nextItem?.id;
  };

  const handlePrev = () => {
    if (index === 0) return;

    rootState.activeId = rootState.list[index - 1].id;
  };

  rootState.eventBus?.useSubscription((payload) => {
    if (payload.id !== id) return;

    const { handleDelete, handleFavorite } = rest;

    switch (payload.action) {
      case LISTEN_KEY.CLIPBOARD_ITEM_PREVIEW:
        return handlePreview();
      case LISTEN_KEY.CLIPBOARD_ITEM_PASTE:
        return pasteToClipboard(data);
      case LISTEN_KEY.CLIPBOARD_ITEM_DELETE:
        return handleDelete();
      case LISTEN_KEY.CLIPBOARD_ITEM_SELECT_PREV:
        return handlePrev();
      case LISTEN_KEY.CLIPBOARD_ITEM_SELECT_NEXT:
        return handleNext();
      case LISTEN_KEY.CLIPBOARD_ITEM_FAVORITE:
        return handleFavorite();
    }
  });

  const { menuItems, ...rest } = useContextMenu({
    ...props,
    handleNext,
  });

  const handleClick = (type: typeof content.autoPaste) => {
    rootState.activeId = id;

    if (content.autoPaste !== type) return;

    pasteToClipboard(data);
  };

  const renderContent = () => {
    if (
      content.maskSensitive &&
      typeof data.search === "string" &&
      (type === "text" || type === "html" || type === "rtf")
    ) {
      const masked = maskSensitiveText(data.search);

      if (masked !== data.search) {
        return (
          <div className="line-clamp-4 whitespace-pre-wrap text-color-1">
            {masked}
          </div>
        );
      }
    }

    if (
      type === "text" &&
      typeof value === "string" &&
      isLikelyLocalPath(value) &&
      isImage(value)
    ) {
      const imageData = {
        ...data,
        type: "image" as const,
      } as DatabaseSchemaHistory<"image">;

      return <Image {...imageData} />;
    }

    switch (type) {
      case "text":
        return <Text {...data} />;
      case "rtf":
        return <Rtf {...data} />;
      case "html":
        return <SafeHtml {...data} />;
      case "image":
        return <Image {...data} />;
      case "files":
        return <Files {...data} />;
    }
  };

  return (
    <Dropdown
      menu={{ items: menuItems }}
      onOpenChange={(open) => {
        if (open) rootState.activeId = id;
      }}
      trigger={["contextMenu"]}
    >
      <Flex
        className={clsx(
          "group b hover:b-primary-5 b-color-2 mx-3 max-h-30 rounded-md p-1.5 transition",
          {
            "b-primary bg-primary-1": rootState.activeId === id,
          },
        )}
        gap={4}
        onClick={() => handleClick("single")}
        onDoubleClick={() => handleClick("double")}
        vertical
      >
        <Header
          {...rest}
          data={data}
          handleEdit={handleEdit}
          handleNote={handleNote}
        />

        <div className="relative flex-1 select-auto overflow-hidden break-words children:transition">
          <div
            className={clsx(
              "pointer-events-none absolute inset-0 line-clamp-4 children:inline opacity-0",
              {
                "group-hover:opacity-0": content.showOriginalContent,
                "opacity-100": note,
              },
            )}
          >
            <UnoIcon
              className="mr-0.5 translate-y-0.5"
              name="i-hugeicons:task-edit-01"
            />

            <Marker mark={rootState.search}>{note}</Marker>
          </div>

          <div
            className={clsx("h-full", {
              "group-hover:opacity-100": content.showOriginalContent,
              "opacity-0": note,
            })}
          >
            {renderContent()}
          </div>
        </div>
      </Flex>
    </Dropdown>
  );
};

export default Item;
