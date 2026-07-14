import { useReactive } from "ahooks";
import { Spin } from "antd";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import ProList from "@/components/ProList";
import { deleteHistory, selectHistory } from "@/database/history";
import { useImmediate } from "@/hooks/useImmediate";
import { clipboardStore } from "@/stores/clipboard";
import type { Interval } from "@/types/shared";
import { dayjs } from "@/utils/dayjs";
import Manual from "../Shared/Manual";
import SavePath from "../Shared/SavePath";
import Delete from "./components/Delete";
import Duration from "./components/Duration";
import MaxCount from "./components/MaxCount";

const History = () => {
  const { t } = useTranslation();
  const state = useReactive({
    spinning: false,
  });
  const timerRef = useRef<Interval>();

  useImmediate(clipboardStore.history, async () => {
    const { duration, maxCount } = clipboardStore.history;

    clearInterval(timerRef.current);

    if (duration === 0 && maxCount === 0) return;

    const delay = 1000 * 60 * 30;

    timerRef.current = setInterval(async () => {
      const list = await selectHistory((qb) => {
        return qb.where("favorite", "=", false);
      });

      for (const [index, item] of list.entries()) {
        const { createTime } = item;
        const diffDays = dayjs().diff(createTime, "days");
        const isExpired = duration > 0 && diffDays >= duration;
        const isOverMaxCount = maxCount > 0 && index >= maxCount;

        if (!isExpired && !isOverMaxCount) continue;

        deleteHistory(item);
      }
    }, delay);
  });

  return (
    <>
      <Spin fullscreen percent="auto" spinning={state.spinning} />

      <ProList
        footer={<Delete />}
        header={t("preference.history.history.title")}
      >
        <Duration />

        <MaxCount />
      </ProList>

      <SavePath state={state} />

      <Manual state={state} />
    </>
  );
};

export default History;
