import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useAsyncEffect } from "ahooks";
import { Select } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import ProList from "@/components/ProList";
import ProListItem from "@/components/ProListItem";
import { clipboardStore } from "@/stores/clipboard";

const AppSelector = ({
  type,
  value,
  onChange,
}: {
  type: string;
  value: string;
  onChange: (val: string) => void;
}) => {
  const { t } = useTranslation();
  const [options, setOptions] = useState<{ label: string; value: string }[]>(
    [],
  );

  useAsyncEffect(async () => {
    try {
      let ext = "";
      switch (type) {
        case "text":
          ext = ".txt";
          break;
        case "image":
          ext = ".png";
          break;
        case "audio":
          ext = ".mp3";
          break;
        case "html":
        case "link":
          ext = ".html";
          break;
        case "rtf":
          ext = ".rtf";
          break;
        case "files":
          ext = "folder";
          break;
      }

      const initialOptions: { label: string; value: string }[] = [
        {
          label: t("preference.clipboard.default_apps.placeholder"),
          value: "",
        },
      ];

      if (ext && ext !== "folder") {
        const apps = await invoke<{ name: string; path: string }[]>(
          "get_app_list",
          { ext },
        );
        apps.forEach((app) => {
          if (!initialOptions.find((o) => o.value === app.path)) {
            initialOptions.push({ label: app.name, value: app.path });
          }
        });
      }

      if (value && !initialOptions.find((o) => o.value === value)) {
        const name = await invoke<string>("get_file_name", { path: value });
        initialOptions.push({ label: name || value, value });
      }

      initialOptions.push({
        label: t("preference.clipboard.default_apps.button.browse"),
        value: "BROWSE",
      });

      setOptions(initialOptions);
    } catch (_e) {}
  }, [type, value, t]);

  const handleSelect = async (val: string) => {
    if (val === "BROWSE") {
      const path = await openDialog({
        directory: false,
        filters: [
          {
            extensions: ["exe", "lnk", "app"],
            name: "Executable",
          },
        ],
        multiple: false,
      });

      if (path) {
        onChange(path as string);
      }
    } else {
      onChange(val);
    }
  };

  return (
    <ProListItem title={t(`preference.clipboard.default_apps.label.${type}`)}>
      <Select
        className="w-64"
        onChange={handleSelect}
        optionLabelProp="label"
        options={options}
        value={value || ""}
      />
    </ProListItem>
  );
};

const DefaultApps = () => {
  const { t } = useTranslation();
  const { content } = useSnapshot(clipboardStore);

  const types = [
    "text",
    "image",
    "html",
    "rtf",
    "audio",
    "files",
    "link",
  ] as const;

  const handleChange = (
    type: keyof typeof content.defaultApps,
    value: string,
  ) => {
    if (!clipboardStore.content.defaultApps) {
      clipboardStore.content.defaultApps = {};
    }
    clipboardStore.content.defaultApps[type] = value;
  };

  return (
    <ProList header={t("preference.clipboard.default_apps.title")}>
      {types.map((type) => (
        <AppSelector
          key={type}
          onChange={(val) => handleChange(type, val)}
          type={type}
          value={content.defaultApps?.[type] || ""}
        />
      ))}
    </ProList>
  );
};

export default DefaultApps;
