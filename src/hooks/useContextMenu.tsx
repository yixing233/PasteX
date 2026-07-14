import { invoke } from "@tauri-apps/api/core";
import { downloadDir, join as tauriJoin, tempDir } from "@tauri-apps/api/path";
import {
  BaseDirectory,
  copyFile,
  readTextFile,
  watch,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { MenuProps } from "antd";
import { Checkbox, Tag } from "antd";
import { find, isArray, remove } from "es-toolkit/compat";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import UnoIcon from "@/components/UnoIcon";
import { deleteHistory, updateHistory } from "@/database/history";
import { MainContext } from "@/pages/Main";
import type { ItemProps } from "@/pages/Main/components/HistoryList/components/Item";
import { pasteToClipboard, writeToClipboard } from "@/plugins/clipboard";
import { clipboardStore } from "@/stores/clipboard";
import { globalStore } from "@/stores/global";
import { dayjs } from "@/utils/dayjs";
import { isMac, normalizeURL } from "@/utils/is";
import { join } from "@/utils/path";
import { parseTagIds, serializeTagIds } from "@/utils/tags";

const externalEditorWatchers = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; unwatch: () => void }
>();

interface UseContextMenuProps extends ItemProps {
  handleNext: () => void;
}

export const useContextMenu = (props: UseContextMenuProps) => {
  const { data, deleteModal, handleNote, handleNext, handleEdit } = props;
  const { id, type, value, group, favorite, subtype } = data;
  const { t } = useTranslation();
  const { env } = useSnapshot(globalStore);
  const { content, tags } = useSnapshot(clipboardStore);
  const { rootState } = useContext(MainContext);
  const textValue = type === "text" ? value : "";

  const normalizedUrl = type === "text" ? normalizeURL(textValue) : null;
  const isUrlLike = Boolean(normalizedUrl);
  const isPathLike =
    subtype === "path" ||
    (type === "text" &&
      (/^(file:\/\/)/i.test(textValue) ||
        /^[a-zA-Z]:[\\/]/.test(textValue) ||
        /^\\\\/.test(textValue) ||
        /^\//.test(textValue)));
  const assignedTagIds = parseTagIds(data.tags);
  const queued = rootState.pasteQueue.some((item) => item.id === id);

  const pasteAsText = () => {
    return pasteToClipboard(data, true);
  };

  const handleFavorite = async () => {
    const nextFavorite = !favorite;

    const matched = find(rootState.list, { id });

    if (!matched) return;

    matched.favorite = nextFavorite;

    updateHistory(id, { favorite: nextFavorite });
  };

  const openToBrowser = () => {
    if (!normalizedUrl) return;

    openUrl(normalizedUrl);
  };

  const exportToFile = async () => {
    if (isArray(value)) return;

    const extname = type === "text" ? "txt" : type;
    const fileName = `${env.appName}_${id}.${extname}`;
    const path = join(await downloadDir(), fileName);

    await writeTextFile(path, value);

    revealItemInDir(path);
  };

  const downloadImage = async () => {
    if (type !== "image") return;

    const fileName = `${env.appName}_${id}.png`;
    const path = join(await downloadDir(), fileName);

    await copyFile(value, path);

    revealItemInDir(path);
  };

  const openToFinder = () => {
    if (type === "text") {
      return revealItemInDir(value);
    }

    const [file] = value;

    revealItemInDir(file);
  };

  const openItem = () => {
    if (isUrlLike) {
      if (!normalizedUrl) return;
      return openUrl(normalizedUrl);
    }
    if (isPathLike) {
      if (!textValue) return;
      return openPath(textValue);
    }
    if (type === "image") {
      return openPath(value);
    }
    if (type === "files") {
      const [file] = value;
      return openPath(file);
    }
    if (type === "text" || type === "html" || type === "rtf") {
      return (async () => {
        let ext = "txt";
        let appKey: keyof typeof content.defaultApps = "text";

        if (type === "html") {
          ext = "html";
          appKey = "html";
        }
        if (type === "rtf") {
          ext = "rtf";
          appKey = "rtf";
        }

        const filename = `pace_${dayjs().format("YYYYMMDDHHmmss")}.${ext}`;
        await writeTextFile(filename, value, { baseDir: BaseDirectory.Temp });

        const tempD = await tempDir();
        const path = await tauriJoin(tempD, filename);
        const app = content.defaultApps?.[appKey];

        if (app) {
          await invoke("open_with", { app, path });
        } else {
          await openPath(path);
        }
      })();
    }
  };

  const toggleTag = (tagId: string) => {
    const nextTagIds = assignedTagIds.includes(tagId)
      ? assignedTagIds.filter((id) => id !== tagId)
      : [...assignedTagIds, tagId];
    const nextTags = serializeTagIds(nextTagIds);
    const matched = find(rootState.list, { id });

    if (matched) {
      matched.tags = nextTags;
    }

    void updateHistory(id, { tags: nextTags });
  };

  const toggleQueue = () => {
    rootState.pasteQueue = queued
      ? rootState.pasteQueue.filter((item) => item.id !== id)
      : [...rootState.pasteQueue, data];
  };

  const openExternalEditor = async () => {
    if (type !== "text" && type !== "html" && type !== "rtf") return;

    const ext = type === "text" ? "txt" : type;
    const path = await tauriJoin(await tempDir(), `pastex_${id}.${ext}`);
    const initialContent = String(value || "");

    externalEditorWatchers.get(id)?.unwatch();
    clearTimeout(externalEditorWatchers.get(id)?.timer);

    await writeTextFile(path, initialContent);

    let lastContent = initialContent;
    const unwatch = await watch(
      path,
      async () => {
        const nextContent = await readTextFile(path).catch(() => "");
        if (nextContent === lastContent) return;

        lastContent = nextContent;
        const matched = find(rootState.list, { id });
        const nextData = {
          count: nextContent.length,
          edited: true,
          search: nextContent,
          value: nextContent,
        };

        if (matched) {
          Object.assign(matched, nextData);
        }

        await updateHistory(id, nextData);
      },
      { delayMs: 350 },
    );
    const timer = setTimeout(
      () => {
        unwatch();
        externalEditorWatchers.delete(id);
      },
      30 * 60 * 1000,
    );
    externalEditorWatchers.set(id, { timer, unwatch });

    const appKey = type as "text" | "html" | "rtf";
    const app = content.defaultApps?.[appKey];
    if (app) {
      await invoke("open_with", { app, path });
    } else {
      await openPath(path);
    }
  };

  const handleDelete = async () => {
    const matched = find(rootState.list, { id });

    if (!matched) return;

    let confirmed = true;

    if (clipboardStore.content.deleteConfirm) {
      confirmed = await deleteModal.confirm({
        afterClose() {
          // 关闭确认框后焦点还在，需要手动取消焦点
          (document.activeElement as HTMLElement)?.blur();
        },
        centered: true,
        content: t("clipboard.hints.delete_modal_content"),
      });
    }

    if (!confirmed) return;

    if (id === rootState.activeId) {
      handleNext();
    }

    remove(rootState.list, { id });
    rootState.pasteQueue = rootState.pasteQueue.filter(
      (item) => item.id !== id,
    );

    deleteHistory(data);
  };

  const menuItems: MenuProps["items"] = [
    {
      icon: <UnoIcon name="i-lucide:copy" />,
      key: "copy",
      label: t("clipboard.button.context_menu.copy"),
      onClick: () => writeToClipboard(data),
    },
    {
      icon: <UnoIcon name="i-lucide:clipboard-pen-line" />,
      key: "note",
      label: t("clipboard.button.context_menu.note"),
      onClick: handleNote,
    },
    {
      icon: <UnoIcon name="i-lucide:edit-3" />,
      key: "edit",
      label: t("clipboard.button.context_menu.edit"),
      onClick: handleEdit,
    },
    (type === "text" || type === "html" || type === "rtf") && {
      icon: <UnoIcon name="i-lucide:file-pen-line" />,
      key: "externalEdit",
      label: t("clipboard.button.context_menu.external_edit"),
      onClick: openExternalEditor,
    },
    {
      children: tags.length
        ? tags.map((tag) => ({
            key: `tag-${tag.id}`,
            label: (
              <span className="flex items-center gap-2">
                <Checkbox checked={assignedTagIds.includes(tag.id)} />
                <Tag bordered={false} color={tag.color}>
                  {tag.name}
                </Tag>
              </span>
            ),
            onClick: () => toggleTag(tag.id),
          }))
        : [
            {
              disabled: true,
              key: "no-tags",
              label: t("clipboard.button.context_menu.no_tags"),
            },
          ],
      icon: (
        <UnoIcon
          className="items-center justify-center self-center"
          name="i-lucide:tag"
          size={16}
        />
      ),
      key: "tags",
      label: t("clipboard.button.context_menu.tags"),
    },
    {
      icon: <UnoIcon name="i-lucide:list-ordered" />,
      key: "sequence",
      label: queued
        ? t("clipboard.button.context_menu.remove_from_sequence")
        : t("clipboard.button.context_menu.add_to_sequence"),
      onClick: toggleQueue,
    },
    // Open
    (type === "image" ||
      type === "files" ||
      type === "text" ||
      type === "html" ||
      type === "rtf" ||
      isUrlLike ||
      isPathLike) && {
      icon: <UnoIcon name="i-lucide:external-link" />,
      key: "open",
      label: t("clipboard.button.context_menu.open"),
      onClick: openItem,
    },
    // Paste as Plain Text
    (type === "html" || type === "rtf") && {
      icon: <UnoIcon name="i-lucide:clipboard-paste" />,
      key: "pasteAsMsg",
      label: t("clipboard.button.context_menu.paste_as_plain_text"),
      onClick: pasteAsText,
    },
    // Paste as Path
    type === "files" && {
      icon: <UnoIcon name="i-lucide:file-symlink" />,
      key: "pasteAsPath",
      label: t("clipboard.button.context_menu.paste_as_path"),
      onClick: pasteAsText,
    },
    // Favorite
    {
      icon: favorite ? (
        <UnoIcon name="i-iconamoon:star-fill" />
      ) : (
        <UnoIcon name="i-iconamoon:star" />
      ),
      key: "favorite",
      label: favorite
        ? t("clipboard.button.context_menu.unfavorite")
        : t("clipboard.button.context_menu.favorite"),
      onClick: handleFavorite,
    },
    // Open in Browser
    isUrlLike && {
      icon: <UnoIcon name="i-lucide:globe" />,
      key: "openInBrowser",
      label: t("clipboard.button.context_menu.open_in_browser"),
      onClick: openToBrowser,
    },
    // Send Email
    subtype === "email" && {
      icon: <UnoIcon name="i-lucide:mail" />,
      key: "sendEmail",
      label: t("clipboard.button.context_menu.send_email"),
      onClick: () => openUrl(`mailto:${value}`),
    },
    // Export As File
    group === "text" && {
      icon: <UnoIcon name="i-lucide:file-output" />,
      key: "exportAsFile",
      label: t("clipboard.button.context_menu.export_as_file"),
      onClick: exportToFile,
    },
    // Download Image
    type === "image" && {
      icon: <UnoIcon name="i-lucide:image-down" />,
      key: "downloadImage",
      label: t("clipboard.button.context_menu.download_image"),
      onClick: downloadImage,
    },
    // Show in File Explorer/Finder
    (type === "files" || isPathLike) && {
      icon: <UnoIcon name="i-lucide:folder-open" />,
      key: "showInExplorer",
      label: isMac
        ? t("clipboard.button.context_menu.show_in_finder")
        : t("clipboard.button.context_menu.show_in_file_explorer"),
      onClick: openToFinder,
    },
    // Delete
    {
      danger: true,
      icon: <UnoIcon name="i-lucide:trash" />,
      key: "delete",
      label: t("clipboard.button.context_menu.delete"),
      onClick: handleDelete,
    },
  ].filter(Boolean) as MenuProps["items"];

  return {
    handleDelete,
    handleFavorite,
    menuItems,
  };
};
