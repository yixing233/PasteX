import { useBoolean } from "ahooks";
import { Button, Input, Modal, Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { nanoid } from "nanoid";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import ProListItem from "@/components/ProListItem";
import { clipboardStore } from "@/stores/clipboard";
import type { ClipboardTag } from "@/types/store";

const COLORS = [
  "blue",
  "cyan",
  "green",
  "gold",
  "orange",
  "red",
  "magenta",
  "purple",
  "geekblue",
];

const TagSettings = () => {
  const { tags } = useSnapshot(clipboardStore);
  const [open, { setFalse, setTrue }] = useBoolean();
  const [draft, setDraft] = useState<ClipboardTag[]>([]);
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return;
    setDraft(tags.map((tag) => ({ ...tag })));
  }, [open, tags]);

  const update = (index: number, value: Partial<ClipboardTag>) => {
    setDraft((current) =>
      current.map((tag, itemIndex) =>
        itemIndex === index ? { ...tag, ...value } : tag,
      ),
    );
  };

  const columns: ColumnsType<ClipboardTag> = [
    {
      dataIndex: "name",
      render: (value, _record, index) => (
        <Input
          onChange={(event) => update(index, { name: event.target.value })}
          value={value}
        />
      ),
      title: t("preference.clipboard.tag_settings.name"),
    },
    {
      dataIndex: "color",
      render: (value, _record, index) => (
        <Select
          className="w-full"
          onChange={(color) => update(index, { color })}
          options={COLORS.map((color) => ({
            label: <span style={{ color }}>● {color}</span>,
            value: color,
          }))}
          value={value}
        />
      ),
      title: t("preference.clipboard.tag_settings.color"),
      width: 150,
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
      width: 90,
    },
  ];

  const save = () => {
    const names = new Set<string>();
    clipboardStore.tags = draft
      .map((tag) => ({ ...tag, name: tag.name.trim() }))
      .filter((tag) => {
        const key = tag.name.toLowerCase();
        if (!key || names.has(key)) return false;
        names.add(key);
        return true;
      });
    setFalse();
  };

  return (
    <>
      <ProListItem
        description={t("preference.clipboard.tag_settings.description")}
        title={t("preference.clipboard.tag_settings.title")}
      >
        <Button onClick={setTrue}>
          {t("preference.clipboard.tag_settings.manage")}
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
                  { color: "blue", id: nanoid(), name: "" },
                ])
              }
            >
              {t("preference.clipboard.tag_settings.add")}
            </Button>
            <Button onClick={setFalse}>{t("common.cancel")}</Button>
            <Button onClick={save} type="primary">
              {t("common.confirm")}
            </Button>
          </Space>
        }
        onCancel={setFalse}
        open={open}
        title={t("preference.clipboard.tag_settings.title")}
        width={620}
      >
        <Table
          columns={columns}
          dataSource={draft}
          pagination={false}
          rowKey="id"
          scroll={{ y: 360 }}
          size="small"
        />
      </Modal>
    </>
  );
};

export default TagSettings;
