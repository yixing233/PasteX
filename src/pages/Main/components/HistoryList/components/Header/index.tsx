import { invoke } from "@tauri-apps/api/core";
import { join, tempDir } from "@tauri-apps/api/path";
import { BaseDirectory, writeTextFile } from "@tauri-apps/plugin-fs";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { useCreation } from "ahooks";
import { Flex, Tag } from "antd";
import clsx from "clsx";
import { filesize } from "filesize";
import { type FC, type MouseEvent, useContext } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import SourceAppIcon from "@/components/SourceAppIcon";
import UnoIcon from "@/components/UnoIcon";
import { MainContext } from "@/pages/Main";
import { transferData } from "@/pages/Preference/components/Clipboard/components/OperationButton";
import { pasteToClipboard, writeToClipboard } from "@/plugins/clipboard";
import { clipboardStore } from "@/stores/clipboard";
import type { DatabaseSchemaHistory } from "@/types/database";
import type { OperationButton } from "@/types/store";
import { dayjs } from "@/utils/dayjs";
import { isImage, isLikelyLocalPath, normalizeURL } from "@/utils/is";
import { parseTagIds } from "@/utils/tags";

interface HeaderProps {
  data: DatabaseSchemaHistory;
  handleNote: () => void;
  handleEdit: () => void;
  handleFavorite: () => void;
  handleDelete: () => void;
}

const Header: FC<HeaderProps> = (props) => {
  const { data } = props;
  const { id, type, value, count, createTime, favorite, subtype } = data;
  const { rootState } = useContext(MainContext);
  const { t, i18n } = useTranslation();
  const { content, tags } = useSnapshot(clipboardStore);
  const itemTags = parseTagIds(data.tags)
    .map((id) => tags.find((tag) => tag.id === id))
    .filter(Boolean);

  const operationButtons = useCreation(() => {
    return content.operationButtons.map((key) => {
      return transferData.find((data) => data.key === key)!;
    });
  }, [content.operationButtons]);

  const renderType = () => {
    let icon = "";
    let title = "";
    const isImagePath =
      typeof value === "string" && isLikelyLocalPath(value) && isImage(value);

    if (isImagePath) {
      icon = "i-lucide:image";
      title = t("clipboard.label.image");
    }

    if (!icon) {
      switch (subtype) {
        case "url":
          icon = "i-lucide:link";
          title = t("clipboard.label.link");
          break;
        case "email":
          icon = "i-lucide:mail";
          title = t("clipboard.label.email");
          break;
        case "color":
          icon = "i-lucide:palette";
          title = t("clipboard.label.color");
          break;
        case "path":
          icon = "i-lucide:folder";
          title = t("clipboard.label.path");
          break;
      }
    }

    if (!icon) {
      switch (type) {
        case "text":
          icon = "i-lucide:file-text";
          title = t("clipboard.label.plain_text");
          break;
        case "rtf":
          icon = "i-lucide:file-type-2";
          title = t("clipboard.label.rtf");
          break;
        case "html":
          icon = "i-lucide:code";
          title = t("clipboard.label.html");
          break;
        case "image":
          icon = "i-lucide:image";
          title = t("clipboard.label.image");
          break;
        case "files":
          icon = "i-lucide:files";
          title = t("clipboard.label.n_files", {
            replace: [value.length],
          });
          break;
      }
    }

    if (!icon) return null;

    return (
      <span className="inline-flex items-center gap-1" title={title}>
        <UnoIcon name={icon} />
        {type === "files" && <span>{value.length}</span>}
      </span>
    );
  };

  const renderCount = () => {
    if (type === "files" || type === "image") {
      return filesize(count, { standard: "jedec" });
    }

    return t("clipboard.label.n_chars", {
      replace: [count],
    });
  };

  const renderPixel = () => {
    if (type !== "image" || !content.showImageSize) return;

    const { width, height } = data;

    return (
      <span>
        {width}×{height}
      </span>
    );
  };

  const handleOpen = async () => {
    let path = "";
    let appKey = type as keyof typeof content.defaultApps;

    try {
      if (subtype === "url") {
        path = normalizeURL(value) || "";
        appKey = "link";
      } else if (type === "files") {
        if (Array.isArray(value) && value.length > 0) {
          path = value[0];
        }
      } else if (type === "image") {
        path = value;
      } else {
        let ext = "txt";
        if (type === "html") ext = "html";
        if (type === "rtf") ext = "rtf";

        const filename = `pace_${dayjs().format("YYYYMMDDHHmmss")}.${ext}`;
        const tempD = await tempDir();

        await writeTextFile(filename, value, { baseDir: BaseDirectory.Temp });

        path = await join(tempD, filename);
      }

      if (!path) return;

      // Use the newly determined appKey to look up the default app
      const app = content.defaultApps?.[appKey];

      if (app) {
        await invoke("open_with", { app, path });
      } else if (appKey === "link") {
        await openUrl(path);
      } else {
        await openPath(path);
      }
    } catch (_error) {}
  };

  const handleClick = (event: MouseEvent, key: OperationButton) => {
    const { handleNote, handleEdit, handleFavorite, handleDelete } = props;

    event.stopPropagation();

    switch (key) {
      case "copy":
        return writeToClipboard(data);
      case "pastePlain":
        return pasteToClipboard(data, true);
      case "note":
        return handleNote();
      case "edit":
        return handleEdit();
      case "star":
        return handleFavorite();
      case "delete":
        return handleDelete();
      case "open":
        return handleOpen();
    }
  };

  return (
    <div className="relative text-color-2">
      <Flex className="flex-1 text-xs" gap="small" wrap="wrap">
        <span>{renderType()}</span>
        {content.showCharCount && <span>{renderCount()}</span>}
        {renderPixel()}
        <span>{dayjs(createTime).locale(i18n.language).fromNow()}</span>
        {Boolean(data.edited) && (
          <span className="rounded bg-primary-1 px-1 text-primary">
            {t("clipboard.label.edited")}
          </span>
        )}
        {data.source && (
          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <SourceAppIcon path={data.sourcePath} />
            {data.source}
          </span>
        )}
        {itemTags.map((tag) => (
          <Tag
            bordered={false}
            className="m-0! px-1! text-[10px]!"
            color={tag!.color}
            key={tag!.id}
          >
            {tag!.name}
          </Tag>
        ))}
      </Flex>

      <Flex
        align="center"
        className={clsx(
          "absolute top-0 right-0 opacity-0 transition group-hover:opacity-100",
          "rounded bg-white/80 px-1 py-0.5 backdrop-blur-sm dark:bg-gray-900/80",
          {
            "opacity-100": rootState.activeId === id,
          },
        )}
        gap={6}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {operationButtons.map((item) => {
          const { key, icon, activeIcon, title } = item;

          const isFavorite = key === "star" && favorite;

          return (
            <UnoIcon
              className={clsx({ "text-gold!": isFavorite })}
              hoverable
              key={key}
              name={isFavorite ? activeIcon : icon}
              onClick={(event) => handleClick(event, key)}
              title={t(title)}
            />
          );
        })}
      </Flex>
    </div>
  );
};

export default Header;
