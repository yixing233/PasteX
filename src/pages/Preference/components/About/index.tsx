import { AlipayOutlined, WechatOutlined } from "@ant-design/icons";
import { getTauriVersion } from "@tauri-apps/api/app";
import { emit } from "@tauri-apps/api/event";
import { arch, version } from "@tauri-apps/plugin-os";
import { useBoolean } from "ahooks";
import { Avatar, Button, Image, message } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "tauri-plugin-clipboard-x-api";
import { useSnapshot } from "valtio";
import ProList from "@/components/ProList";
import ProListItem from "@/components/ProListItem";
import { ISSUES_LINK, LISTEN_KEY, REPOSITORY_LINK } from "@/constants";
import { openLinkPromptWindow } from "@/plugins/linkPrompt";
import { globalStore } from "@/stores/global";
import { isDev } from "@/utils/is";

const About = () => {
  const DEBUG_LINK_URL = REPOSITORY_LINK;

  const { env } = useSnapshot(globalStore);
  const { t } = useTranslation();
  const [visible, { toggle }] = useBoolean();
  const [imageSrc, setImageSrc] = useState("");

  const getReadableErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === "string") {
      return error;
    }

    if (error && typeof error === "object") {
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }

    return "unknown error";
  };

  const copyInfo = async () => {
    const { appName, appVersion, platform } = env;

    const info = {
      appName,
      appVersion,
      platform,
      platformArch: arch(),
      platformVersion: version(),
      tauriVersion: await getTauriVersion(),
    };

    await writeText(JSON.stringify(info, null, 2));

    message.success(t("preference.about.about_software.hints.copy_success"));
  };

  const previewImage = (src: string) => {
    setImageSrc(src);
    toggle();
  };

  const debugLinkPrompt = async () => {
    try {
      const opened = await openLinkPromptWindow(DEBUG_LINK_URL);

      if (!opened) {
        message.warning("未获取到显示器信息，无法打开调试弹窗");
      }
    } catch (error) {
      message.error(getReadableErrorMessage(error));
    }
  };

  return (
    <ProList header={t("preference.about.about_software.title")}>
      <ProListItem
        avatar={<Avatar shape="square" size={44} src="/PasteX.png" />}
        description={`${t("preference.about.about_software.label.version")}v${env.appVersion}`}
        title={env.appName}
      >
        <Button
          onClick={() => {
            emit(LISTEN_KEY.UPDATE_APP, true);
          }}
          type="primary"
        >
          {t("preference.about.about_software.button.check_update")}
        </Button>
      </ProListItem>

      <ProListItem
        description={t("preference.about.about_software.hints.software_info")}
        title={t("preference.about.about_software.label.software_info")}
      >
        <Button onClick={copyInfo}>
          {t("preference.about.about_software.button.copy")}
        </Button>
      </ProListItem>

      {isDev() && (
        <ProListItem
          title={t("preference.about.about_software.label.debug_tools")}
        >
          <Button onClick={debugLinkPrompt}>
            {t("preference.about.about_software.button.debug_link_prompt")}
          </Button>
        </ProListItem>
      )}

      <ProListItem
        description={<a href={REPOSITORY_LINK}>{REPOSITORY_LINK}</a>}
        title={t("preference.about.about_software.label.open_source_address")}
      >
        <Button danger href={ISSUES_LINK}>
          {t("preference.about.about_software.button.feedback_issue")}
        </Button>
      </ProListItem>

      <ProListItem
        title={t("preference.about.about_software.label.sponsor_us")}
      >
        <Button
          className="hover:b-wechat!"
          icon={<WechatOutlined className="text-wechat" />}
          onClick={() => {
            previewImage("/wx_qrcode.png");
          }}
        />
        <Button
          className="hover:b-alipay!"
          icon={<AlipayOutlined className="text-alipay" />}
          onClick={() => {
            previewImage("/zfb_qrcode.png");
          }}
        />
      </ProListItem>

      <Image
        hidden
        preview={{
          onVisibleChange: toggle,
          src: imageSrc,
          visible,
        }}
      />
    </ProList>
  );
};

export default About;
