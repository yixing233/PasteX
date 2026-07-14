import { ReloadOutlined } from "@ant-design/icons";
import { Button, Flex, message, Tag } from "antd";
import clsx from "clsx";
import { useContext, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import UnoIcon from "@/components/UnoIcon";
import { forceFetchLatest } from "@/hooks/useSync";
import { showWindow } from "@/plugins/window";
import { clipboardStore } from "@/stores/clipboard";
import { isLinux, isWin } from "@/utils/is";
import { MainContext } from "../..";
import AdvancedFilter from "../AdvancedFilter";
import DateFilter from "../DateFilter";
import EdgeAutoHideHandle from "../EdgeAutoHideHandle";
import GroupList from "../GroupList";
import HistoryList from "../HistoryList";
import SearchInput from "../SearchInput";
import SequenceQueue from "../SequenceQueue";
import WindowPin from "../WindowPin";

const StandardMode = () => {
  const { rootState } = useContext(MainContext);
  const { t } = useTranslation();
  const { search } = useSnapshot(clipboardStore);
  const [pullingLatest, setPullingLatest] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();
  const actionPanelRef = useRef<HTMLDivElement>(null);
  const [groupRightInset, setGroupRightInset] = useState(96);

  useLayoutEffect(() => {
    const element = actionPanelRef.current;

    if (!element) return;

    const updateInset = () => {
      setGroupRightInset(element.offsetWidth + 12);
    };

    updateInset();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateInset);

      return () => {
        window.removeEventListener("resize", updateInset);
      };
    }

    const observer = new ResizeObserver(() => {
      updateInset();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const handlePullLatest = async () => {
    if (pullingLatest) return;

    setPullingLatest(true);
    try {
      const result = await forceFetchLatest();

      if (!result) {
        messageApi.warning(t("clipboard.hints.manual_pull_not_ready"));
        return;
      }

      if (result.reason === "applied") {
        messageApi.success(t("clipboard.hints.manual_pull_applied"));
        return;
      }

      if (result.reason === "no-data") {
        messageApi.info(t("clipboard.hints.manual_pull_empty"));
        return;
      }

      if (result.reason === "ignored-self") {
        messageApi.info(t("clipboard.hints.manual_pull_empty"));
        return;
      }

      if (!result.ok) {
        messageApi.error(
          result.status
            ? t("clipboard.hints.manual_pull_failed_http", {
                status: result.status,
              })
            : t("clipboard.hints.manual_pull_failed_reason", {
                reason: result.error || result.reason,
              }),
        );
      }
    } catch {
      messageApi.error(t("clipboard.hints.manual_pull_exception"));
    } finally {
      setPullingLatest(false);
    }
  };

  return (
    <Flex
      className={clsx("h-screen bg-color-1 py-3", {
        "b b-color-1": isLinux,
        "flex-col-reverse": search.position === "bottom",
        "rounded-2.5": !isWin,
      })}
      data-tauri-drag-region
      gap={12}
      vertical
    >
      {contextHolder}
      <EdgeAutoHideHandle />

      <Flex align="center" className="mx-3 text-color-2" gap={8}>
        <SearchInput className="flex-1" />
        <DateFilter />
        <AdvancedFilter />
      </Flex>

      <Flex
        className="relative flex-1 overflow-hidden"
        data-tauri-drag-region
        gap={12}
        vertical
      >
        <div className="relative h-10 px-3" data-tauri-drag-region>
          <Flex align="center" className="h-full w-full overflow-hidden">
            <GroupList rightInset={groupRightInset} />
          </Flex>

          <Flex
            align="center"
            className="-translate-y-1/2 absolute top-1/2 right-3 z-30 h-10 rounded-3 border border-white/35 bg-white/58 px-2 text-color-2 text-sm shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-lg dark:border-white/15 dark:bg-gray-900/52"
            data-tauri-drag-region={false}
            gap={4}
            ref={actionPanelRef}
          >
            <SequenceQueue />
            {rootState.group === "sync" && (
              <Button
                aria-label="pull-latest"
                data-tauri-drag-region={false}
                icon={<ReloadOutlined />}
                loading={pullingLatest}
                onClick={() => {
                  void handlePullLatest();
                }}
                size="small"
                type="text"
              />
            )}

            <Tag.CheckableTag
              checked={rootState.group === "favorite"}
              className={clsx({
                "bg-primary!": rootState.group === "favorite",
                "m-0": true,
                "text-xs": true,
              })}
              data-tauri-drag-region="false"
              onChange={() => {
                rootState.group = "favorite";
              }}
            >
              {t("clipboard.label.tab.favorite")}
            </Tag.CheckableTag>

            <WindowPin />

            <UnoIcon
              data-tauri-drag-region={false}
              hoverable
              name="i-lets-icons:setting-alt-line"
              onClick={() => {
                showWindow("preference");
              }}
              size={16}
            />
          </Flex>
        </div>

        <HistoryList />
      </Flex>
    </Flex>
  );
};

export default StandardMode;
