import { Tag } from "antd";
import clsx from "clsx";
import { useContext, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import Scrollbar from "@/components/Scrollbar";
import { scrollElementToCenter } from "@/utils/dom";
import { MainContext } from "../..";

interface GroupItem {
  id: string;
  name: string;
}

interface GroupListProps {
  rightInset?: number;
}

const GroupList = ({ rightInset = 96 }: GroupListProps) => {
  const { rootState } = useContext(MainContext);
  const { t } = useTranslation();
  const scrollbarRef = useRef<HTMLElement>(null);

  const presetGroups: GroupItem[] = [
    { id: "all", name: t("clipboard.label.tab.all") },
    { id: "sync", name: t("clipboard.label.tab.sync") },
    { id: "text", name: t("clipboard.label.tab.text") },
    { id: "image", name: t("clipboard.label.tab.image") },
    { id: "files", name: t("clipboard.label.tab.files") },
    { id: "rtf", name: t("clipboard.label.tab.rtf") },
    { id: "url", name: t("clipboard.label.tab.url") },
    { id: "favorite", name: t("clipboard.label.tab.favorite") },
  ];

  const resolveScrollContainer = () => {
    const root = scrollbarRef.current;

    if (!root) return null;

    if (root.scrollWidth > root.clientWidth + 1) {
      return root;
    }

    const candidates = root.querySelectorAll<HTMLElement>("*");
    for (const element of candidates) {
      if (element.scrollWidth > element.clientWidth + 1) {
        return element;
      }
    }

    return null;
  };

  const onWheel = (event: React.WheelEvent<HTMLElement>) => {
    const delta = event.deltaY || event.deltaX;
    if (delta === 0) return;

    const scroller = resolveScrollContainer();
    if (scroller) {
      scroller.scrollLeft += delta * 0.6;
      event.preventDefault();
    }
  };

  useEffect(() => {
    if (rootState.group === "favorite") return;
    scrollElementToCenter(rootState.group);
  }, [rootState.group]);

  return (
    <Scrollbar
      className="h-full w-full overflow-hidden whitespace-nowrap"
      ref={scrollbarRef}
      thumbSize={0}
    >
      <div
        className="flex h-full w-max min-w-full items-center gap-1 pl-1"
        onWheel={onWheel}
        style={{ paddingRight: `${Math.max(16, rightInset)}px` }}
      >
        {presetGroups
          .filter((item) => item.id !== "favorite")
          .map((item) => (
            <div className="shrink-0" id={item.id} key={item.id}>
              <Tag.CheckableTag
                checked={rootState.group === item.id}
                className={clsx({
                  "bg-primary!": rootState.group === item.id,
                  "m-0": true,
                })}
                data-tauri-drag-region="false"
                onChange={() => {
                  rootState.group = item.id;
                }}
              >
                {item.name}
              </Tag.CheckableTag>
            </div>
          ))}
      </div>
    </Scrollbar>
  );
};

export default GroupList;
