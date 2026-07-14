import { useBoolean } from "ahooks";
import { Button, Input, Modal, message, Space, Switch, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { nanoid } from "nanoid";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import ProListItem from "@/components/ProListItem";
import { clipboardStore } from "@/stores/clipboard";
import type { CleaningRule } from "@/types/store";

const CleaningRules = () => {
  const { content } = useSnapshot(clipboardStore);
  const [open, { setFalse, setTrue }] = useBoolean();
  const [draft, setDraft] = useState<CleaningRule[]>([]);
  const [messageApi, contextHolder] = message.useMessage();
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    setDraft(content.cleaningRules.map((rule) => ({ ...rule })));
  }, [open, content.cleaningRules]);

  const update = (index: number, value: Partial<CleaningRule>) => {
    setDraft((current) =>
      current.map((rule, itemIndex) =>
        itemIndex === index ? { ...rule, ...value } : rule,
      ),
    );
  };

  const columns: ColumnsType<CleaningRule> = [
    {
      dataIndex: "enabled",
      render: (value, _record, index) => (
        <Switch
          checked={value}
          onChange={(enabled) => update(index, { enabled })}
          size="small"
        />
      ),
      title: t("preference.clipboard.cleaning_rules.enabled"),
      width: 70,
    },
    {
      dataIndex: "name",
      render: (value, _record, index) => (
        <Input
          onChange={(event) => update(index, { name: event.target.value })}
          value={value}
        />
      ),
      title: t("preference.clipboard.cleaning_rules.name"),
      width: 130,
    },
    {
      dataIndex: "pattern",
      render: (value, _record, index) => (
        <Input
          onChange={(event) => update(index, { pattern: event.target.value })}
          placeholder={String.raw`\s+$`}
          value={value}
        />
      ),
      title: t("preference.clipboard.cleaning_rules.pattern"),
    },
    {
      dataIndex: "replacement",
      render: (value, _record, index) => (
        <Input
          onChange={(event) =>
            update(index, { replacement: event.target.value })
          }
          value={value}
        />
      ),
      title: t("preference.clipboard.cleaning_rules.replacement"),
      width: 130,
    },
    {
      key: "action",
      render: (_value, _record, index) => (
        <Button
          danger
          onClick={() =>
            setDraft((current) =>
              current.filter((_, itemIndex) => itemIndex !== index),
            )
          }
          size="small"
        >
          {t("clipboard.button.context_menu.delete")}
        </Button>
      ),
      width: 80,
    },
  ];

  const save = () => {
    const next = draft
      .map((rule) => ({
        ...rule,
        name: rule.name.trim(),
        pattern: rule.pattern.trim(),
      }))
      .filter((rule) => rule.name && rule.pattern);

    try {
      for (const rule of next) {
        new RegExp(rule.pattern, "gu");
      }
    } catch {
      messageApi.error(t("preference.clipboard.cleaning_rules.invalid"));
      return;
    }

    clipboardStore.content.cleaningRules = next;
    setFalse();
  };

  return (
    <>
      {contextHolder}
      <ProListItem
        description={t("preference.clipboard.cleaning_rules.description")}
        title={t("preference.clipboard.cleaning_rules.title")}
      >
        <Button onClick={setTrue}>
          {t("preference.clipboard.cleaning_rules.manage")}
        </Button>
      </ProListItem>
      <Modal
        centered
        footer={
          <Space>
            <Button
              onClick={() =>
                setDraft((current) => [
                  ...current,
                  {
                    enabled: true,
                    id: nanoid(),
                    name: "",
                    pattern: "",
                    replacement: "",
                  },
                ])
              }
            >
              {t("preference.clipboard.cleaning_rules.add")}
            </Button>
            <Button onClick={setFalse}>{t("common.cancel")}</Button>
            <Button onClick={save} type="primary">
              {t("common.confirm")}
            </Button>
          </Space>
        }
        onCancel={setFalse}
        open={open}
        title={t("preference.clipboard.cleaning_rules.title")}
        width={860}
      >
        <Table
          columns={columns}
          dataSource={draft}
          pagination={false}
          rowKey="id"
          scroll={{ x: 760, y: 360 }}
          size="small"
        />
      </Modal>
    </>
  );
};

export default CleaningRules;
