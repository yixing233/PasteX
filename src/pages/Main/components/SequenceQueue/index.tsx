import { Badge, Button, Popover, Space } from "antd";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import UnoIcon from "@/components/UnoIcon";
import { GLOBAL_SHORTCUT } from "@/constants";
import { MainContext } from "../..";

const SequenceQueue = () => {
  const { rootState } = useContext(MainContext);
  const { t } = useTranslation();
  const count = rootState.pasteQueue.length;

  const content = (
    <Space className="max-w-80" direction="vertical" size="small">
      <div className="max-h-40 overflow-y-auto">
        {rootState.pasteQueue.map((item, index) => (
          <div className="truncate py-1 text-xs" key={item.id}>
            {index + 1}. {String(item.search || item.value || "")}
          </div>
        ))}
        {!count && (
          <div className="text-color-3 text-xs">
            {t("clipboard.queue.empty")}
          </div>
        )}
      </div>
      <Space>
        <Button
          disabled={!count}
          onClick={() => rootState.pasteNext?.()}
          size="small"
          type="primary"
        >
          {t("clipboard.queue.paste_next")}
        </Button>
        <Button
          disabled={!count}
          onClick={() => {
            rootState.pasteQueue = [];
          }}
          size="small"
        >
          {t("clipboard.queue.clear")}
        </Button>
      </Space>
      <div className="text-[11px] text-color-3">
        {GLOBAL_SHORTCUT.SEQUENTIAL_PASTE}
      </div>
    </Space>
  );

  return (
    <Popover
      content={content}
      placement="bottomRight"
      title={t("clipboard.queue.title")}
      trigger="click"
    >
      <Badge count={count} offset={[-2, 2]} size="small">
        <Button
          icon={<UnoIcon name="i-lucide:list-ordered" />}
          size="small"
          type={count ? "primary" : "text"}
        />
      </Badge>
    </Popover>
  );
};

export default SequenceQueue;
