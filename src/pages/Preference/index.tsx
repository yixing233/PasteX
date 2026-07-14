import { emit } from "@tauri-apps/api/event";
import { useCreation, useMount, useScroll } from "ahooks";
import { Flex } from "antd";
import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import UnoIcon from "@/components/UnoIcon";
import UpdateApp from "@/components/UpdateApp";
import { LISTEN_KEY } from "@/constants";
import { useSubscribe } from "@/hooks/useSubscribe";
import { useTray } from "@/hooks/useTray";
import { clipboardStore } from "@/stores/clipboard";
import { globalStore } from "@/stores/global";
import { isMac } from "@/utils/is";
import { saveStore } from "@/utils/store";
import About from "./components/About";
import Acknowledgements from "./components/Acknowledgements";
import Clipboard from "./components/Clipboard";
import General from "./components/General";
import History from "./components/History";
import Shortcut from "./components/Shortcut";
import Sync from "./components/Sync";

const Preference = () => {
  const { t } = useTranslation();
  const { appearance } = useSnapshot(globalStore);
  const [activeKey, setActiveKey] = useState("clipboard");
  const contentRef = useRef<HTMLDivElement>(null);
  const scroll = useScroll(contentRef);
  const [scrollPercent, setScrollPercent] = useState(0);
  const scrollPositions = useRef<Record<string, number>>({});

  const { createTray } = useTray();

  useMount(async () => {
    createTray();
  });

  // Calculate scroll percentage
  useEffect(() => {
    if (!contentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    const maxScroll = scrollHeight - clientHeight;
    const percent = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
    setScrollPercent(Math.min(100, Math.max(0, percent)));
  }, [scroll, activeKey]);

  // Restore scroll position when activeKey changes
  useLayoutEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = scrollPositions.current[activeKey] || 0;
    }
  }, [activeKey]);

  // 监听全局配置项变化
  useSubscribe(globalStore, () => handleStoreChanged());

  // 监听剪贴板配置项变化
  useSubscribe(clipboardStore, () => handleStoreChanged());

  // 配置项变化通知其它窗口和本地存储
  const handleStoreChanged = () => {
    emit(LISTEN_KEY.STORE_CHANGED, { clipboardStore, globalStore });

    saveStore();
  };

  const menuItems = useCreation(() => {
    return [
      {
        content: <Clipboard />,
        icon: "i-lucide:clipboard-list",
        key: "clipboard",
        label: t("preference.menu.title.clipboard"),
      },
      {
        content: <History />,
        icon: "i-lucide:history",
        key: "history",
        label: t("preference.menu.title.history"),
      },
      {
        content: <General />,
        icon: "i-lucide:bolt",
        key: "general",
        label: t("preference.menu.title.general"),
      },
      {
        content: <Shortcut />,
        icon: "i-lucide:keyboard",
        key: "shortcut",
        label: t("preference.menu.title.shortcut"),
      },
      {
        content: <Sync />,
        icon: "i-lucide:cloud",
        key: "sync",
        label: t("preference.menu.title.sync"),
      },
      // {
      //   content: <Backup />,
      //   icon: "i-lucide:database-backup",
      //   key: "backup",
      //   label: t("preference.menu.title.backup"),
      // },
      {
        content: <Acknowledgements />,
        icon: "i-lucide:badge-info",
        key: "acknowledgements",
        label: t("preference.menu.title.acknowledgements"),
      },
      {
        content: <About />,
        icon: "i-lucide:info",
        key: "about",
        label: t("preference.menu.title.about"),
      },
    ];
  }, [appearance.language]);

  const handleMenuClick = (key: string) => {
    if (contentRef.current) {
      scrollPositions.current[activeKey] = contentRef.current.scrollTop;
    }
    setActiveKey(key);
  };

  return (
    <Flex className="h-screen">
      <Flex
        className={clsx("h-full w-40 p-3", [isMac ? "pt-8" : "bg-color-1"])}
        data-tauri-drag-region
        gap="small"
        vertical
      >
        {menuItems.map((item) => {
          const { key, label, icon } = item;

          return (
            <Flex
              align="center"
              className={clsx(
                "cursor-pointer rounded-lg p-3 p-r-0 text-color-2 transition hover:bg-color-4",
                {
                  "bg-primary! text-white!": activeKey === key,
                },
              )}
              gap="small"
              key={key}
              onClick={() => handleMenuClick(key)}
            >
              <UnoIcon name={icon} size={20} />

              <span className="font-bold">{label}</span>
            </Flex>
          );
        })}
      </Flex>

      <div className="relative h-full flex-1 overflow-hidden bg-color-2">
        {/* Progress Bar */}
        <div
          className="absolute top-0 left-0 z-50 h-1 bg-gradient-to-r from-blue-400 to-purple-600 transition-all duration-150 ease-out"
          style={{
            opacity: scrollPercent > 0 ? 1 : 0,
            width: `${scrollPercent}%`,
          }}
        />

        {/* biome-ignore lint/correctness/useUniqueElementIds: used for scroll spy */}
        <div
          className="scrollbar-hide h-full overflow-y-auto p-4"
          data-tauri-drag-region
          id="preference-content"
          ref={contentRef}
          // Hide scrollbar using CSS utility if available, or style
          style={{ msOverflowStyle: "none", scrollbarWidth: "none" }}
        >
          <style>
            {`
                #preference-content::-webkit-scrollbar {
                  display: none;
                }
              `}
          </style>
          {menuItems.map((item) => {
            const { key, content } = item;

            return (
              <div
                className={
                  key === activeKey
                    ? "fade-in zoom-in-95 animate-in duration-300"
                    : ""
                }
                hidden={key !== activeKey}
                key={key}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>

      <UpdateApp />
    </Flex>
  );
};

export default Preference;
