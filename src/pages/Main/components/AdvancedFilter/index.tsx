import { Badge, Button, Input, Popover, Select, Space } from "antd";
import { useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import UnoIcon from "@/components/UnoIcon";
import { clipboardStore } from "@/stores/clipboard";
import { MainContext } from "../..";

const AdvancedFilter = () => {
  const { rootState } = useContext(MainContext);
  const { tags } = useSnapshot(clipboardStore);
  const { t } = useTranslation();
  const count =
    rootState.tagFilters.length + (rootState.sourceFilter?.trim() ? 1 : 0);

  useEffect(() => {
    const validIds = new Set(tags.map((tag) => tag.id));
    const nextFilters = rootState.tagFilters.filter((id) => validIds.has(id));

    if (nextFilters.length !== rootState.tagFilters.length) {
      rootState.tagFilters = nextFilters;
    }
  }, [tags, rootState]);

  const content = (
    <Space className="w-70" direction="vertical" size="small">
      <Input
        allowClear
        onChange={(event) => {
          rootState.sourceFilter = event.target.value;
        }}
        placeholder={t("clipboard.filter.source_placeholder")}
        value={rootState.sourceFilter}
      />
      <Select
        allowClear
        className="w-full"
        maxTagCount="responsive"
        mode="multiple"
        onChange={(value) => {
          rootState.tagFilters = value;
        }}
        options={tags.map((tag) => ({
          label: tag.name,
          value: tag.id,
        }))}
        placeholder={t("clipboard.filter.tags_placeholder")}
        value={rootState.tagFilters}
      />
      <Button
        block
        disabled={!count}
        onClick={() => {
          rootState.sourceFilter = "";
          rootState.tagFilters = [];
        }}
        size="small"
      >
        {t("clipboard.filter.clear")}
      </Button>
    </Space>
  );

  return (
    <Popover
      content={content}
      placement="bottomRight"
      title={t("clipboard.filter.advanced")}
      trigger="click"
    >
      <Badge count={count} offset={[-2, 2]} size="small">
        <Button
          icon={<UnoIcon name="i-lucide:list-filter" />}
          size="small"
          type={count ? "primary" : "default"}
        />
      </Badge>
    </Popover>
  );
};

export default AdvancedFilter;
