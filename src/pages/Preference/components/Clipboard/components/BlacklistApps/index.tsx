import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useBoolean } from "ahooks";
import { Button, Input, Modal, Select, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import ProListItem from "@/components/ProListItem";
import { selectHistory } from "@/database/history";
import { clipboardStore } from "@/stores/clipboard";
import type { BlacklistAppItem } from "@/types/store";

const BlacklistApps = () => {
  const { content } = useSnapshot(clipboardStore);
  const [modalOpen, { setFalse, setTrue }] = useBoolean();
  const [sourceModalOpen, { setFalse: closeSourceModal, setTrue: openSourceModal }] =
    useBoolean();
  const [sourceOptions, setSourceOptions] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const { t } = useTranslation();
  const [draftList, setDraftList] = useState<BlacklistAppItem[]>([]);

  useEffect(() => {
    if (!modalOpen) return;
    setDraftList(
      (content.blacklistApps || []).map((item) => ({
        name: String(item.name || ""),
        process: String(item.process || ""),
      })),
    );
  }, [modalOpen, content.blacklistApps]);

  const updateItem = (
    index: number,
    key: keyof BlacklistAppItem,
    value: string,
  ) => {
    const next = [...draftList];
    const current = next[index] || { name: "", process: "" };
    next[index] = { ...current, [key]: value };
    setDraftList(next);
  };

  const removeItem = (index: number) => {
    const next = [...draftList];
    next.splice(index, 1);
    setDraftList(next);
  };

  const addItem = () => {
    setDraftList([...draftList, { name: "", process: "" }]);
  };

  const addIfNotExists = (
    target: BlacklistAppItem[],
    item: BlacklistAppItem,
  ) => {
    const process = item.process.trim().toLowerCase();
    if (!process) return;

    const existed = target.some(
      (app) => app.process.trim().toLowerCase() === process,
    );
    if (existed) return;

    target.push(item);
  };

  const pickLocalApps = async () => {
    const selected = await openDialog({
      directory: false,
      filters: [
        {
          extensions: ["exe"],
          name: "Applications",
        },
      ],
      multiple: true,
    });

    if (!selected) return;

    const paths = Array.isArray(selected) ? selected : [selected];
    const next = [...draftList];

    for (const item of paths) {
      const fullPath = String(item || "");
      if (!fullPath) continue;

      const process = fullPath.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") || "";
      if (!process) continue;

      let name = process;
      try {
        const fileName = await invoke<string>("get_file_name", { path: fullPath });
        if (fileName) name = fileName;
      } catch {
        // ignore and fallback to process name
      }

      addIfNotExists(next, { name, process });
    }

    setDraftList(next);
  };

  const loadHistorySources = async () => {
    const list = await selectHistory();
    const uniqueSources = Array.from(
      new Set(
        list
          .map((item) => String(item.source || "").trim())
          .filter(Boolean),
      ),
    );

    setSourceOptions(uniqueSources);
    setSelectedSources([]);
    openSourceModal();
  };

  const addSelectedSources = () => {
    const next = [...draftList];

    for (const source of selectedSources) {
      addIfNotExists(next, {
        name: source,
        process: source,
      });
    }

    setDraftList(next);
    closeSourceModal();
  };

  const saveDraft = () => {
    const next = draftList
      .map((item) => {
        const name = String(item.name || "").trim();
        const process = String(item.process || "").trim();
        if (!name && !process) return null;
        return {
          name: name || process,
          process: process || name,
        };
      })
      .filter(Boolean) as BlacklistAppItem[];

    clipboardStore.content.blacklistApps = next;
    setFalse();
  };

  const columns: ColumnsType<BlacklistAppItem> = [
    {
      dataIndex: "name",
      key: "name",
      title: t("preference.clipboard.content_settings.label.blacklist_app_name"),
      width: "40%",
      render: (value, _record, index) => (
        <Input
          onChange={(event) => {
            updateItem(index, "name", event.target.value);
          }}
          placeholder={t(
            "preference.clipboard.content_settings.hints.blacklist_app_name_placeholder",
          )}
          value={value}
        />
      ),
    },
    {
      dataIndex: "process",
      key: "process",
      title: t("preference.clipboard.content_settings.label.blacklist_app_process"),
      width: "40%",
      render: (value, _record, index) => (
        <Input
          onChange={(event) => {
            updateItem(index, "process", event.target.value);
          }}
          placeholder={t(
            "preference.clipboard.content_settings.hints.blacklist_app_process_placeholder",
          )}
          value={value}
        />
      ),
    },
    {
      key: "action",
      render: (_value, _record, index) => (
        <Button danger onClick={() => removeItem(index)} size="small">
          {t("clipboard.button.context_menu.delete")}
        </Button>
      ),
      title: "",
      width: "20%",
    },
  ];

  return (
    <>
      <ProListItem
        description={t("preference.clipboard.content_settings.hints.blacklist_apps")}
        title={t("preference.clipboard.content_settings.label.blacklist_apps")}
      >
        <Button onClick={setTrue}>
          {t("preference.clipboard.content_settings.button.manage_blacklist_apps")}
        </Button>
      </ProListItem>

      <Modal
        centered
        classNames={{
          body: "overflow-y-auto",
        }}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={pickLocalApps}>
              {t("preference.clipboard.content_settings.button.pick_blacklist_apps")}
            </Button>
            <Button onClick={loadHistorySources}>
              {t(
                "preference.clipboard.content_settings.button.pick_blacklist_apps_from_history_source",
              )}
            </Button>
            <Button onClick={addItem} type="primary">
              {t("preference.clipboard.content_settings.button.add_blacklist_app")}
            </Button>
            <Button onClick={setFalse}>
              {t("common.cancel")}
            </Button>
            <Button onClick={saveDraft} type="primary">
              {t("common.confirm")}
            </Button>
          </Space>
        }
        onCancel={setFalse}
        open={modalOpen}
        styles={{
          body: {
            maxHeight: "calc(100vh - 240px)",
          },
        }}
        title={t("preference.clipboard.content_settings.label.blacklist_apps")}
        width={720}
      >
        <Table
          columns={columns}
          dataSource={draftList}
          pagination={false}
          rowKey={(_record, index) => String(index)}
          size="small"
        />
      </Modal>

      <Modal
        centered
        onCancel={closeSourceModal}
        onOk={addSelectedSources}
        open={sourceModalOpen}
        title={t(
          "preference.clipboard.content_settings.label.pick_blacklist_apps_from_history_source",
        )}
      >
        <Select
          mode="multiple"
          onChange={(value) => setSelectedSources(value)}
          options={sourceOptions.map((item) => ({
            label: item,
            value: item,
          }))}
          placeholder={t(
            "preference.clipboard.content_settings.hints.pick_blacklist_apps_from_history_source",
          )}
          style={{ width: "100%" }}
          value={selectedSources}
        />
      </Modal>
    </>
  );
};

export default BlacklistApps;
