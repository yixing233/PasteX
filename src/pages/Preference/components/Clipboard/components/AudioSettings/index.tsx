import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import ProList from "@/components/ProList";
import ProSwitch from "@/components/ProSwitch";
import UnoIcon from "@/components/UnoIcon";
import { previewAudio } from "@/plugins/audio";
import { clipboardStore } from "@/stores/clipboard";

const AudioSettings = () => {
  const { audio } = useSnapshot(clipboardStore);
  const { t } = useTranslation();

  const handleSelectAudio = async (type: "copy" | "paste") => {
    try {
      const selected = await open({
        filters: [
          {
            extensions: ["mp3", "wav", "ogg", "flac"],
            name: "Audio",
          },
        ],
        multiple: false,
      });

      if (selected) {
        if (type === "copy") {
          clipboardStore.audio.copyPath = selected as string;
        } else {
          clipboardStore.audio.pastePath = selected as string;
        }
      }
    } catch (_error) {}
  };

  const handleClearAudio = (type: "copy" | "paste") => {
    if (type === "copy") {
      clipboardStore.audio.copyPath = undefined;
    } else {
      clipboardStore.audio.pastePath = undefined;
    }
  };

  return (
    <ProList header={t("preference.clipboard.audio_settings.title")}>
      <ProSwitch
        onChange={(value) => {
          clipboardStore.audio.copy = value;
          if (value) {
            previewAudio("copy");
          }
        }}
        title={t("preference.clipboard.audio_settings.label.copy_audio")}
        value={audio.copy}
      >
        <div className="flex items-center gap-2">
          {audio.copyPath && (
            <div
              className="flex cursor-pointer items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-gray-500 text-xs transition-colors hover:bg-red-100 hover:text-red-500 dark:bg-gray-800"
              onClick={(e) => {
                e.stopPropagation();
                handleClearAudio("copy");
              }}
              title={audio.copyPath}
            >
              <span className="max-w-[100px] truncate">
                {audio.copyPath.split(/[\\/]/).pop()}
              </span>
              <UnoIcon name="i-iconamoon:close-circle-1-light" />
            </div>
          )}

          <UnoIcon
            className="flex! cursor-pointer text-gray-500 hover:text-primary"
            name="i-iconamoon:folder-add-light"
            onClick={(e) => {
              e.stopPropagation();
              handleSelectAudio("copy");
            }}
            size={20}
            title={t("preference.clipboard.default_apps.button.browse")}
          />

          <UnoIcon
            className="flex! cursor-pointer text-gray-500 hover:text-primary"
            name="i-iconamoon:volume-up-light"
            onClick={(e) => {
              e.stopPropagation();
              previewAudio("copy");
            }}
            size={22}
          />
        </div>
      </ProSwitch>

      <ProSwitch
        onChange={(value) => {
          clipboardStore.audio.paste = value;
          if (value) {
            previewAudio("paste");
          }
        }}
        title={t("preference.clipboard.audio_settings.label.paste_audio")}
        value={audio.paste}
      >
        <div className="flex items-center gap-2">
          {audio.pastePath && (
            <div
              className="flex cursor-pointer items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-gray-500 text-xs transition-colors hover:bg-red-100 hover:text-red-500 dark:bg-gray-800"
              onClick={(e) => {
                e.stopPropagation();
                handleClearAudio("paste");
              }}
              title={audio.pastePath}
            >
              <span className="max-w-[100px] truncate">
                {audio.pastePath.split(/[\\/]/).pop()}
              </span>
              <UnoIcon name="i-iconamoon:close-circle-1-light" />
            </div>
          )}

          <UnoIcon
            className="flex! cursor-pointer text-gray-500 hover:text-primary"
            name="i-iconamoon:folder-add-light"
            onClick={(e) => {
              e.stopPropagation();
              handleSelectAudio("paste");
            }}
            size={20}
            title={t("preference.clipboard.default_apps.button.browse")}
          />

          <UnoIcon
            className="flex! cursor-pointer text-gray-500 hover:text-primary"
            name="i-iconamoon:volume-up-light"
            onClick={(e) => {
              e.stopPropagation();
              previewAudio("paste");
            }}
            size={22}
          />
        </div>
      </ProSwitch>
    </ProList>
  );
};

export default AudioSettings;
