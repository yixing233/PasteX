import {
  AppleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DesktopOutlined,
  DisconnectOutlined,
  KeyOutlined,
  LinkOutlined,
  MobileOutlined,
  PlusOutlined,
  ReloadOutlined,
  UserOutlined,
  WindowsOutlined,
} from "@ant-design/icons";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Flex,
  Input,
  List,
  Modal,
  message,
  Popconfirm,
  Progress,
  Radio,
  Space,
  Tag,
} from "antd";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import ProList from "@/components/ProList";
import ProSwitch from "@/components/ProSwitch";
import { forceReconnect } from "@/hooks/useSync";
import { globalStore } from "@/stores/global";
import { setSyncConnected, syncState } from "@/stores/syncState";

const Sync = () => {
  const { t } = useTranslation();
  const { sync, lanSync, realtimeSync } = useSnapshot(globalStore);

  const toggleLanSync = async (enable: boolean) => {
    globalStore.lanSync.enabled = enable;
    if (enable) {
      try {
        const url = await invoke<string>("start_lan_server", {
          port: globalStore.lanSync.port,
        });
        const ip = url.replace("http://", "").split(":")[0];
        globalStore.lanSync.ip = ip;
        message.success(t("preference.settings.lan_settings.hints.enable"));
      } catch (e) {
        message.error(
          t("preference.settings.sync_settings.hints.error_message", {
            error: String(e),
          }),
        );
        globalStore.lanSync.enabled = false;
      }
    } else {
      try {
        await invoke("stop_lan_server");
      } catch (e) {
        message.error(
          t("preference.settings.sync_settings.hints.error_message", {
            error: String(e),
          }),
        );
      }
    }
  };

  useEffect(() => {
    if (globalStore.lanSync.enabled) {
      invoke<string>("start_lan_server", { port: globalStore.lanSync.port })
        .then((url) => {
          const ip = url.replace("http://", "").split(":")[0];
          globalStore.lanSync.ip = ip;
        })
        .catch((_e) => {
          // Silent fail or log
        });
    }
  }, []);

  const syncStateSnapshot = useSnapshot(syncState);
  const [testing, setTesting] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [messageApi, contextHolder] = message.useMessage();

  // Local state for serverUrl to prevent cursor jumping
  const [serverUrl, setServerUrl] = useState(globalStore.sync.serverUrl);

  // Sync from store if store updates externally
  useEffect(() => {
    setServerUrl(sync.serverUrl);
  }, [sync.serverUrl]);

  useEffect(() => {
    if (verifyServerTimerRef.current) {
      clearTimeout(verifyServerTimerRef.current);
    }

    if (!serverUrl.trim()) {
      setIsServerVerified(false);
      setServerVerifyStatus("unknown");
      return;
    }

    verifyServerTimerRef.current = setTimeout(() => {
      void commitServerUrlAndVerify();
    }, 600);

    return () => {
      if (verifyServerTimerRef.current) {
        clearTimeout(verifyServerTimerRef.current);
      }
    };
  }, [serverUrl]);

  // Modal States
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [equipModalOpen, setEquipModalOpen] = useState(false);
  const [deviceDetailOpen, setDeviceDetailOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [tempUsername, setTempUsername] = useState("");
  const [tempKey, setTempKey] = useState("");
  const [isServerVerified, setIsServerVerified] = useState(false);
  const [isVerifyingServer, setIsVerifyingServer] = useState(false);
  const [serverVerifyStatus, setServerVerifyStatus] = useState<
    "unknown" | "reachable" | "unreachable"
  >("unknown");
  const verifyServerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const hasBond = Boolean(sync.username && sync.secretKey);
  const showBondButtons = !sync.enabled && !hasBond && isServerVerified;

  const getVerifyIcon = () => {
    if (serverVerifyStatus === "reachable") {
      return <CheckCircleOutlined className="text-green-500" />;
    }
    if (serverVerifyStatus === "unreachable") {
      return <CloseCircleOutlined className="text-red-500" />;
    }
    return <ReloadOutlined />;
  };

  const normalizeServerUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return "";
    return trimmed.startsWith("http") ? trimmed : `http://${trimmed}`;
  };

  const verifyServerReachable = async (
    url: string,
    options?: { showToast?: boolean },
  ) => {
    const { showToast = false } = options || {};
    const normalizedUrl = normalizeServerUrl(url);
    if (!normalizedUrl) {
      setIsServerVerified(false);
      setServerVerifyStatus("unknown");
      return false;
    }

    setIsVerifyingServer(true);
    try {
      const endpoint = `${normalizedUrl.replace(/\/$/, "")}/api/bond/check?username=${encodeURIComponent("__pastex_probe__")}`;
      const response = await fetch(endpoint);

      if (!response.ok) {
        setIsServerVerified(false);
        setServerVerifyStatus("unreachable");
        return false;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setIsServerVerified(false);
        setServerVerifyStatus("unreachable");
        return false;
      }

      const data = await response.json();
      const verified = Boolean(data?.success);
      setIsServerVerified(verified);
      setServerVerifyStatus(verified ? "reachable" : "unreachable");

      if (showToast) {
        if (verified) {
          messageApi.success(
            t("preference.settings.sync_settings.hints.server_verified"),
          );
        } else {
          messageApi.error(
            t("preference.settings.sync_settings.hints.server_verify_required"),
          );
        }
      }

      return verified;
    } catch (_error) {
      setIsServerVerified(false);
      setServerVerifyStatus("unreachable");

      if (showToast) {
        messageApi.error(
          t("preference.settings.sync_settings.hints.server_verify_required"),
        );
      }

      return false;
    } finally {
      setIsVerifyingServer(false);
    }
  };

  const commitServerUrlAndVerify = async (options?: {
    showToast?: boolean;
  }) => {
    const normalized = normalizeServerUrl(serverUrl);
    globalStore.sync.serverUrl = normalized;
    await verifyServerReachable(normalized, options);
  };

  const generateKey = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const randomValues = new Uint32Array(32);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(randomValues[i] % chars.length);
    }
    return result;
  };

  const handleCreateBond = () => {
    setTempUsername("");
    setTempKey(generateKey());
    setCreateModalOpen(true);
  };

  const handleEquipBond = () => {
    setTempUsername("");
    setTempKey("");
    setEquipModalOpen(true);
  };

  const handleCreateOk = async () => {
    if (!tempUsername) {
      message.error(
        t("preference.settings.sync_settings.hints.username_required"),
      );
      return;
    }
    if (!tempKey) {
      message.error(
        t("preference.settings.sync_settings.hints.secret_key_required"),
      );
      return;
    }
    const s = getPasswordStrength(tempKey);
    if (s.status === "exception") {
      message.error(s.text);
      return;
    }

    try {
      const normalizedUrl = normalizeServerUrl(sync.serverUrl || serverUrl);
      if (!normalizedUrl) {
        message.error(
          t("preference.settings.sync_settings.hints.server_url_required"),
        );
        return;
      }

      const reachable = await verifyServerReachable(normalizedUrl);
      if (!reachable) {
        message.error(
          t("preference.settings.sync_settings.hints.connection_error", {
            error: "Server is unreachable",
          }),
        );
        return;
      }

      const apiUrl = `${normalizedUrl.replace(/\/$/, "")}/api/bond/register`;
      const res = await fetch(apiUrl, {
        body: JSON.stringify({
          secretKey: tempKey,
          username: tempUsername,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (res.status === 409) {
        message.error(
          t("preference.settings.sync_settings.hints.username_exists"),
        );
        return;
      }

      if (!res.ok) {
        message.error(
          t("preference.settings.sync_settings.hints.connection_failed", {
            status: res.status,
          }),
        );
        return;
      }

      // Check Content-Type
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        // Only read text if we suspect it's not JSON, to avoid consuming body if we want to stream (not applicable here but good practice)
        const text = await res.text();
        if (text.trim().startsWith("<")) {
          throw new Error(
            t("preference.settings.sync_settings.hints.connection_error", {
              error: "Server returned HTML. Check Port/URL.",
            }),
          );
        }
        throw new Error(`Invalid response type: ${contentType}`);
      }

      const data = await res.json();
      if (!data.success) {
        if (String(data.error || "").includes("Username")) {
          message.error(
            t("preference.settings.sync_settings.hints.username_exists"),
          );
        } else {
          message.error(
            t("preference.settings.sync_settings.hints.connection_error", {
              error: data.error || "Unknown error",
            }),
          );
        }
        return;
      }

      globalStore.sync.serverUrl = normalizedUrl;
      setIsServerVerified(true);
      globalStore.sync.username = tempUsername;
      globalStore.sync.secretKey = tempKey;
      message.success(
        t("preference.settings.sync_settings.hints.bond_created"),
      );
      setCreateModalOpen(false);
    } catch (e) {
      message.error(
        t("preference.settings.sync_settings.hints.connection_error", {
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      return;
    }
  };

  const handleEquipOk = async () => {
    if (!tempUsername) {
      message.error(
        t("preference.settings.sync_settings.hints.username_required"),
      );
      return;
    }
    if (!tempKey) {
      message.error(
        t("preference.settings.sync_settings.hints.secret_key_required"),
      );
      return;
    }

    try {
      const normalizedUrl = normalizeServerUrl(sync.serverUrl || serverUrl);
      if (!normalizedUrl) {
        message.error(
          t("preference.settings.sync_settings.hints.server_url_required"),
        );
        return;
      }

      const reachable = await verifyServerReachable(normalizedUrl);
      if (!reachable) {
        message.error(
          t("preference.settings.sync_settings.hints.connection_error", {
            error: "Server is unreachable",
          }),
        );
        return;
      }

      const apiUrl = `${normalizedUrl.replace(/\/$/, "")}/api/bond/verify`;
      const res = await fetch(apiUrl, {
        body: JSON.stringify({
          secretKey: tempKey,
          username: tempUsername,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (res.status === 404) {
        message.error(
          t("preference.settings.sync_settings.hints.bond_not_found"),
        );
        return;
      }

      if (!res.ok) {
        message.error(
          t("preference.settings.sync_settings.hints.connection_failed", {
            status: res.status,
          }),
        );
        return;
      }

      const data = await res.json();
      if (!data.success) {
        message.error(
          t("preference.settings.sync_settings.hints.connection_error", {
            error: data.error || "Unknown error",
          }),
        );
        return;
      }

      globalStore.sync.serverUrl = normalizedUrl;
      setIsServerVerified(true);
    } catch (e) {
      message.error(
        t("preference.settings.sync_settings.hints.connection_error", {
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      return;
    }

    globalStore.sync.username = tempUsername;
    globalStore.sync.secretKey = tempKey;
    setEquipModalOpen(false);
  };

  const handleUnbind = () => {
    globalStore.sync.enabled = false;
    globalStore.sync.username = "";
    globalStore.sync.secretKey = "";
    setSyncConnected(false);
    setDevices([]);
    setDeviceDetailOpen(false);
    setSelectedDevice(null);
  };

  const myClientId = localStorage.getItem("pastex_client_id");

  // Fetch Connected Devices
  const fetchDevices = async () => {
    if (
      !globalStore.sync.serverUrl ||
      !syncStateSnapshot.isConnected ||
      !globalStore.sync.username ||
      !globalStore.sync.secretKey
    ) {
      setDevices([]);
      return;
    }

    try {
      const url = globalStore.sync.serverUrl.replace(/\/$/, "");
      const response = await fetch(`${url}/api/clients`, {
        headers: {
          ...(globalStore.sync.secretKey && {
            Authorization: `Bearer ${encodeURIComponent(globalStore.sync.username)}:${globalStore.sync.secretKey}`,
          }),
        },
      });
      if (response.ok) {
        const res = await response.json();
        if (res.success) {
          setDevices(res.data);
          return;
        }
      }
      setDevices([]);
    } catch (_e) {
      setDevices([]);
    }
  };

  // Poll for devices when connected
  // Poll for devices when connected
  useEffect(() => {
    const timer = setInterval(() => {
      if (syncStateSnapshot.isConnected) fetchDevices();
    }, 5000);
    return () => clearInterval(timer);
  }, [syncStateSnapshot.isConnected]);

  // Initial fetch when connection state changes
  useEffect(() => {
    if (syncStateSnapshot.isConnected) fetchDevices();
  }, [syncStateSnapshot.isConnected]);

  useEffect(() => {
    if (!syncStateSnapshot.isConnected) {
      setDevices([]);
      setDeviceDetailOpen(false);
      setSelectedDevice(null);
    }
  }, [syncStateSnapshot.isConnected]);

  // 测试连接
  const testConnection = async () => {
    if (!globalStore.sync.serverUrl) {
      messageApi.error(
        t("preference.settings.sync_settings.hints.server_url_required"),
      );
      return;
    }

    if (!globalStore.sync.secretKey) {
      messageApi.error(
        t("preference.settings.sync_settings.hints.secret_key_required"),
      );
      return;
    }

    if (!globalStore.sync.username) {
      messageApi.error(
        t("preference.settings.sync_settings.hints.username_required"),
      );
      return;
    }

    // Check strength for validity
    const allowRes = getPasswordStrength(globalStore.sync.secretKey);
    if (allowRes.status === "exception") {
      messageApi.error(allowRes.text);
      return;
    }

    setTesting(true);

    try {
      // 构建完整的 URL
      const url = globalStore.sync.serverUrl.replace(/\/$/, "");
      const healthUrl = `${url}/health`;

      const response = await fetch(healthUrl, {
        headers: {
          "Content-Type": "application/json",
          ...(globalStore.sync.secretKey && {
            Authorization: `Bearer ${encodeURIComponent(globalStore.sync.username)}:${globalStore.sync.secretKey}`,
          }),
        },
        method: "GET",
      });

      if (response.ok) {
        // Check content type before parsing
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const data = await response.json();
          messageApi.success(
            t("preference.settings.sync_settings.hints.connection_success", {
              clients: data.clients || 0,
              items: data.items || 0,
            }),
          );
        } else {
          // Not JSON, probably HTML (404 page or index.html from wrong server)
          const text = await response.text();
          let errorMsg = "Invalid server response (Not JSON).";
          if (text.trim().startsWith("<")) {
            errorMsg =
              "Server returned HTML. You might be connecting to the wrong port (e.g. frontend instead of backend).";
          }
          throw new Error(errorMsg);
        }
      } else {
        messageApi.error(
          t("preference.settings.sync_settings.hints.connection_failed", {
            status: response.status,
          }),
        );
      }
    } catch (error) {
      messageApi.error(
        t("preference.settings.sync_settings.hints.connection_error", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setTesting(false);
    }
  };

  const getPasswordStrength = (password: string) => {
    if (!password)
      return { color: "#ff4d4f", percent: 0, status: "exception", text: "" };

    // Check for non-ASCII (e.g. Chinese)
    // Only allow ASCII printable characters (32-126)
    if (/[^\x20-\x7E]/.test(password)) {
      return {
        color: "#ff4d4f",
        percent: 0,
        status: "exception",
        text: t(
          "preference.settings.sync_settings.hints.strength_invalid_char",
        ),
      };
    }

    // Check length
    if (password.length < 8)
      return {
        color: "#ff4d4f",
        percent: 30,
        status: "exception",
        text: t("preference.settings.sync_settings.hints.strength_weak_short"),
      };

    let score = 0;
    if (password.length >= 12) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    // Normalize
    if (score < 2)
      return {
        color: "#faad14",
        percent: 60,
        status: "active",
        text: t("preference.settings.sync_settings.hints.strength_medium"),
      };
    return {
      color: "#52c41a",
      percent: 100,
      status: "success",
      text: t("preference.settings.sync_settings.hints.strength_strong"),
    };
  };

  return (
    <>
      {contextHolder}

      <ProList header={t("preference.settings.realtime_sync_settings.title")}>
        <ProSwitch
          description={t(
            "preference.settings.realtime_sync_settings.hints.enable",
          )}
          onChange={(value) => {
            globalStore.realtimeSync.enabled = value;
          }}
          title={t("preference.settings.realtime_sync_settings.label.enable")}
          value={realtimeSync.enabled}
        />
        {realtimeSync.enabled && (
          <Flex className="px-4 py-3" gap="middle" vertical>
            <div className="font-medium text-color-2 text-sm">
              {t("preference.settings.realtime_sync_settings.label.mode")}
            </div>
            <Radio.Group
              onChange={(e) => {
                globalStore.realtimeSync.mode = e.target.value;
              }}
              value={realtimeSync.mode}
            >
              <Flex gap="large" vertical>
                <Flex align="flex-start" gap="small" vertical>
                  <Radio value="remote">
                    <span className="font-medium">
                      {t(
                        "preference.settings.realtime_sync_settings.label.remote",
                      )}
                    </span>
                  </Radio>
                  <span className="pl-6 text-color-3 text-xs">
                    {t(
                      "preference.settings.realtime_sync_settings.hints.remote_desc",
                    )}
                  </span>
                  {realtimeSync.mode === "remote" && (
                    <Flex
                      className="ml-6 self-stretch border-t border-t-[var(--ant-color-border-secondary)]"
                      vertical
                    >
                      {/* 收藏夹同步开关 */}
                      <ProSwitch
                        description={t(
                          "preference.settings.sync_settings.hints.enable_sync",
                        )}
                        onChange={(value) => {
                          if (value) {
                            if (
                              !globalStore.sync.username ||
                              !globalStore.sync.secretKey
                            ) {
                              message.error(
                                t(
                                  "preference.settings.sync_settings.hints.bond_required",
                                ),
                              );
                              return;
                            }
                            const s = getPasswordStrength(
                              globalStore.sync.secretKey,
                            );
                            if (s.status === "exception") {
                              message.error(s.text);
                              return;
                            }
                          }
                          globalStore.sync.enabled = value;
                        }}
                        title={t(
                          "preference.settings.sync_settings.label.enable_sync",
                        )}
                        value={sync.enabled}
                      />

                      {/* 服务器地址 */}
                      <Flex
                        className="border-t border-t-[var(--ant-color-border-secondary)] px-4 py-3"
                        gap="small"
                        vertical
                      >
                        <div className="font-medium text-color-2 text-sm">
                          {t(
                            "preference.settings.sync_settings.label.server_url",
                          )}
                        </div>
                        <Flex align="center" className="w-full" gap="small">
                          <Input
                            className="min-w-0 flex-1"
                            disabled={sync.enabled}
                            onBlur={() => {
                              void commitServerUrlAndVerify();
                            }}
                            onChange={(e) => {
                              setServerUrl(e.target.value);
                              setIsServerVerified(false);
                              setServerVerifyStatus("unknown");
                            }}
                            onPressEnter={() => {
                              void commitServerUrlAndVerify();
                            }}
                            placeholder="http://localhost:7755"
                            value={serverUrl}
                          />
                          {!hasBond && (
                            <Button
                              disabled={sync.enabled || !serverUrl.trim()}
                              icon={getVerifyIcon()}
                              loading={isVerifyingServer}
                              onClick={() => {
                                void commitServerUrlAndVerify({
                                  showToast: true,
                                });
                              }}
                            />
                          )}
                        </Flex>
                      </Flex>

                      {/* 纽带 */}
                      {!hasBond && showBondButtons ? (
                        <Flex
                          className="border-t border-t-[var(--ant-color-border-secondary)] px-4 py-3"
                          gap="middle"
                          justify="center"
                        >
                          <Button
                            icon={<PlusOutlined />}
                            onClick={handleCreateBond}
                            type="primary"
                          >
                            {t(
                              "preference.settings.sync_settings.button.create_bond",
                            )}
                          </Button>
                          <Button
                            icon={<LinkOutlined />}
                            onClick={handleEquipBond}
                          >
                            {t(
                              "preference.settings.sync_settings.button.equip_bond",
                            )}
                          </Button>
                        </Flex>
                      ) : hasBond ? (
                        <Flex
                          align="center"
                          className="border-t border-t-[var(--ant-color-border-secondary)] px-4 py-3"
                          justify="space-between"
                        >
                          <Flex align="center" className="min-w-0" gap="small">
                            <UserOutlined className="shrink-0 text-primary" />
                            <span className="shrink-0 font-medium text-color-1 text-sm">
                              {sync.username}
                            </span>
                            <span className="text-color-3 text-xs">|</span>
                            <Flex
                              align="center"
                              className="shrink-0 text-color-3 text-xs"
                              gap={4}
                            >
                              <KeyOutlined />
                              <span>••••••••</span>
                              <CopyOutlined
                                className="cursor-pointer transition-colors hover:text-primary"
                                onClick={() => {
                                  navigator.clipboard.writeText(sync.secretKey);
                                  message.success(t("common.copied"));
                                }}
                              />
                            </Flex>
                          </Flex>
                          <Popconfirm
                            cancelText={t("common.cancel")}
                            description={t(
                              "preference.settings.sync_settings.hints.unbind_confirm",
                            )}
                            okButtonProps={{ danger: true }}
                            okText={t("common.confirm")}
                            onConfirm={handleUnbind}
                            title={t(
                              "preference.settings.sync_settings.label.unbind_confirm_title",
                            )}
                          >
                            <Button
                              danger
                              icon={<DisconnectOutlined />}
                              size="small"
                            >
                              {t(
                                "preference.settings.sync_settings.button.unbind_bond",
                              )}
                            </Button>
                          </Popconfirm>
                        </Flex>
                      ) : null}

                      {/* 连接状态 & 测试按钮 */}
                      <Flex
                        align="center"
                        className="border-t border-t-[var(--ant-color-border-secondary)] px-4 py-3"
                        justify="space-between"
                      >
                        {sync.secretKey && sync.username ? (
                          <Flex
                            align="center"
                            className="mr-3 min-w-0 flex-1"
                            gap="small"
                          >
                            <div
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                syncStateSnapshot.isConnected
                                  ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]"
                                  : syncStateSnapshot.isConnecting
                                    ? "animate-pulse bg-blue-400"
                                    : "bg-red-500"
                              }`}
                            />
                            <span className="shrink-0 text-color-2 text-xs">
                              {syncStateSnapshot.isConnected
                                ? t(
                                    "preference.settings.sync_settings.label.connected",
                                  )
                                : syncStateSnapshot.isConnecting
                                  ? t(
                                      "preference.settings.sync_settings.label.connecting",
                                    )
                                  : t(
                                      "preference.settings.sync_settings.label.connection_failed",
                                    )}
                            </span>
                            {syncStateSnapshot.isConnected &&
                              sync.enabled &&
                              syncStateSnapshot.lastSyncTime && (
                                <span className="truncate text-color-3 text-xs">
                                  ·{" "}
                                  {t(
                                    "preference.settings.sync_settings.label.last_sync_time",
                                    {
                                      time: new Date(
                                        syncStateSnapshot.lastSyncTime,
                                      ).toLocaleTimeString(),
                                    },
                                  )}
                                </span>
                              )}
                            {!syncStateSnapshot.isConnected &&
                              !syncStateSnapshot.isConnecting &&
                              syncStateSnapshot.error && (
                                <span className="truncate text-red-400 text-xs">
                                  · {syncStateSnapshot.error}
                                </span>
                              )}
                            {!syncStateSnapshot.isConnected &&
                              !syncStateSnapshot.isConnecting && (
                                <Button
                                  className="h-auto shrink-0 p-0 text-xs"
                                  danger
                                  onClick={() => {
                                    forceReconnect();
                                    message.info(
                                      t(
                                        "preference.settings.sync_settings.label.retry",
                                      ),
                                    );
                                  }}
                                  size="small"
                                  type="link"
                                >
                                  {t(
                                    "preference.settings.sync_settings.label.reconnection",
                                  )}
                                </Button>
                              )}
                          </Flex>
                        ) : (
                          <div />
                        )}
                        <Button
                          className="shrink-0"
                          disabled={
                            !serverUrl || !sync.secretKey || !sync.username
                          }
                          loading={testing}
                          onClick={testConnection}
                          size="small"
                          type="primary"
                        >
                          {t(
                            "preference.settings.sync_settings.button.test_connection",
                          )}
                        </Button>
                      </Flex>

                      {/* 已连接设备列表 */}
                      {syncStateSnapshot.isConnected && devices.length > 0 && (
                        <Flex
                          className="border-t border-t-[var(--ant-color-border-secondary)] px-4 py-3"
                          gap="small"
                          vertical
                        >
                          <div className="font-medium text-color-2 text-sm">
                            {t(
                              "preference.settings.sync_settings.label.connected_devices",
                            )}
                          </div>
                          <List
                            dataSource={devices}
                            renderItem={(item: any) => {
                              const info = item.info || {};
                              const isSelf = info.id === myClientId;
                              const platform =
                                typeof info.platform === "string"
                                  ? info.platform
                                  : "unknown";
                              const osVersion =
                                typeof info.osVersion === "string"
                                  ? info.osVersion
                                  : "-";
                              const userAgent =
                                typeof info.userAgent === "string"
                                  ? info.userAgent
                                  : "";
                              const connectedAtText = item.connectedAt
                                ? new Date(item.connectedAt).toLocaleString()
                                : "";

                              let Icon = DesktopOutlined;
                              if (platform === "android" || platform === "ios")
                                Icon = MobileOutlined;
                              if (platform === "macos") Icon = AppleOutlined;
                              if (platform === "windows")
                                Icon = WindowsOutlined;

                              return (
                                <List.Item
                                  className="mb-2 cursor-pointer rounded-lg border border-[var(--ant-color-border-secondary)] bg-[var(--ant-color-fill-tertiary)] px-3 py-2 last:mb-0"
                                  onClick={() => {
                                    setSelectedDevice({
                                      ...item,
                                      connectedAtText,
                                      osVersion,
                                      platform,
                                      userAgent,
                                    });
                                    setDeviceDetailOpen(true);
                                  }}
                                >
                                  <List.Item.Meta
                                    avatar={
                                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ant-color-fill-quaternary)] text-color-2 text-lg">
                                        <Icon />
                                      </div>
                                    }
                                    description={
                                      <Space
                                        className="text-color-3 text-xs"
                                        size={4}
                                        wrap
                                      >
                                        <Tag
                                          className="m-0 capitalize"
                                          color="blue"
                                        >
                                          {platform}
                                        </Tag>
                                        <span>{osVersion}</span>
                                        {connectedAtText && (
                                          <>
                                            <span>•</span>
                                            <span>{connectedAtText}</span>
                                          </>
                                        )}
                                      </Space>
                                    }
                                    title={
                                      <Space align="center" size={6} wrap>
                                        <span className="font-medium text-color-1 text-sm">
                                          {info.hostname ||
                                            t(
                                              "preference.settings.sync_settings.label.unknown_device",
                                            )}
                                        </span>
                                        {isSelf && (
                                          <Tag bordered={false} color="green">
                                            {t(
                                              "preference.settings.sync_settings.label.this_device",
                                            )}
                                          </Tag>
                                        )}
                                      </Space>
                                    }
                                  />
                                </List.Item>
                              );
                            }}
                            split={false}
                          />
                        </Flex>
                      )}
                    </Flex>
                  )}
                </Flex>
                <div className="ml-6 border-t border-t-[var(--ant-color-border-secondary)]" />
                <Flex align="flex-start" gap="small" vertical>
                  <Radio value="lan">
                    <span className="font-medium">
                      {t(
                        "preference.settings.realtime_sync_settings.label.lan",
                      )}
                    </span>
                  </Radio>
                  <span className="pl-6 text-color-3 text-xs">
                    {t(
                      "preference.settings.realtime_sync_settings.hints.lan_desc",
                    )}
                  </span>
                  {realtimeSync.mode === "lan" && (
                    <Flex
                      className="ml-6 self-stretch border-t border-t-[var(--ant-color-border-secondary)]"
                      vertical
                    >
                      <ProSwitch
                        description={t(
                          "preference.settings.lan_settings.hints.enable",
                        )}
                        onChange={toggleLanSync}
                        title={t(
                          "preference.settings.lan_settings.label.enable",
                        )}
                        value={lanSync.enabled}
                      />
                      {lanSync.enabled && (
                        <Flex
                          align="center"
                          className="border-t border-t-[var(--ant-color-border-secondary)] px-4 py-3"
                          gap="small"
                        >
                          <Input
                            readOnly
                            value={`http://${lanSync.ip || "127.0.0.1"}:${lanSync.port}/latest`}
                          />
                          <CopyOutlined
                            className="cursor-pointer text-base transition-colors hover:text-primary"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                `http://${lanSync.ip || "127.0.0.1"}:${lanSync.port}/latest`,
                              );
                              message.success(t("common.copied"));
                            }}
                          />
                        </Flex>
                      )}
                    </Flex>
                  )}
                </Flex>
              </Flex>
            </Radio.Group>
          </Flex>
        )}
      </ProList>

      <Modal
        footer={null}
        onCancel={() => {
          setDeviceDetailOpen(false);
          setSelectedDevice(null);
        }}
        open={deviceDetailOpen}
        title="设备详情"
      >
        {selectedDevice && (
          <Flex className="pt-2" gap={10} vertical>
            <Flex gap="small" justify="space-between">
              <span className="text-color-3 text-xs">设备名</span>
              <span className="max-w-[70%] break-all text-right text-color-1 text-sm">
                {selectedDevice.info?.hostname ||
                  t("preference.settings.sync_settings.label.unknown_device")}
              </span>
            </Flex>
            <Flex gap="small" justify="space-between">
              <span className="text-color-3 text-xs">平台</span>
              <span className="max-w-[70%] break-all text-right text-color-1 text-sm capitalize">
                {selectedDevice.platform || "unknown"}
              </span>
            </Flex>
            <Flex gap="small" justify="space-between">
              <span className="text-color-3 text-xs">系统版本</span>
              <span className="max-w-[70%] break-all text-right text-color-1 text-sm">
                {selectedDevice.osVersion || "-"}
              </span>
            </Flex>
            <Flex gap="small" justify="space-between">
              <span className="text-color-3 text-xs">连接时间</span>
              <span className="max-w-[70%] break-all text-right text-color-1 text-sm">
                {selectedDevice.connectedAtText || "-"}
              </span>
            </Flex>
            <Flex gap="small" justify="space-between">
              <span className="text-color-3 text-xs">IP</span>
              <span className="max-w-[70%] break-all text-right text-color-1 text-sm">
                {selectedDevice.ip || "-"}
              </span>
            </Flex>
            <Flex gap="small" justify="space-between">
              <span className="text-color-3 text-xs">Client ID</span>
              <span className="max-w-[70%] break-all text-right text-color-1 text-sm">
                {selectedDevice.info?.id || "-"}
              </span>
            </Flex>
            <Flex gap="small" justify="space-between">
              <span className="text-color-3 text-xs">应用版本</span>
              <span className="max-w-[70%] break-all text-right text-color-1 text-sm">
                {selectedDevice.info?.appVersion || "-"}
              </span>
            </Flex>
            <Flex gap="small" justify="space-between">
              <span className="text-color-3 text-xs">语言</span>
              <span className="max-w-[70%] break-all text-right text-color-1 text-sm">
                {selectedDevice.info?.language || "-"}
              </span>
            </Flex>
            <div className="border-t border-t-[var(--ant-color-border-secondary)] pt-2">
              <div className="mb-1 text-color-3 text-xs">User Agent</div>
              <div className="max-h-40 overflow-y-auto break-all rounded bg-[var(--ant-color-fill-tertiary)] px-2 py-1 text-color-1 text-xs leading-5">
                {selectedDevice.userAgent || "-"}
              </div>
            </div>
          </Flex>
        )}
      </Modal>

      {/* Create Bond Modal */}
      <Modal
        onCancel={() => setCreateModalOpen(false)}
        onOk={handleCreateOk}
        open={createModalOpen}
        title={t("preference.settings.sync_settings.button.create_bond")}
      >
        <Flex className="pt-4" gap="middle" vertical>
          <div>
            <div className="mb-2 text-color-2 text-sm">
              {t("preference.settings.sync_settings.label.username")}
            </div>
            <Input
              onChange={(e) => setTempUsername(e.target.value)}
              placeholder={t(
                "preference.settings.sync_settings.hints.username_placeholder",
              )}
              value={tempUsername}
            />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2 text-color-2 text-sm">
              <span>
                {t("preference.settings.sync_settings.label.secret_key")}
              </span>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setTempKey(generateKey())}
                size="small"
                type="link"
              >
                {t("preference.settings.sync_settings.button.refresh")}
              </Button>
            </div>
            <Flex align="center" gap="small">
              <Input.Password
                className="flex-1"
                onChange={(e) => setTempKey(e.target.value)}
                placeholder={t(
                  "preference.settings.sync_settings.hints.secret_key_placeholder",
                )}
                value={tempKey}
              />
              {tempKey && (
                <div className="flex w-24 flex-col justify-center">
                  <Progress
                    className="m-0"
                    percent={getPasswordStrength(tempKey).percent}
                    showInfo={false}
                    size="small"
                    strokeColor={{ "0%": "#ff4d4f", "100%": "#52c41a" }}
                  />
                  <span
                    style={{
                      color: getPasswordStrength(tempKey).color,
                      fontSize: "10px",
                      textAlign: "center",
                    }}
                  >
                    {getPasswordStrength(tempKey).text}
                  </span>
                </div>
              )}
            </Flex>
          </div>
        </Flex>
      </Modal>

      {/* Equip Bond Modal */}
      <Modal
        onCancel={() => setEquipModalOpen(false)}
        onOk={handleEquipOk}
        open={equipModalOpen}
        title={t("preference.settings.sync_settings.button.equip_bond")}
      >
        <Flex className="pt-4" gap="middle" vertical>
          <div>
            <div className="mb-2 text-color-2 text-sm">
              {t("preference.settings.sync_settings.label.username")}
            </div>
            <Input
              onChange={(e) => setTempUsername(e.target.value)}
              placeholder={t(
                "preference.settings.sync_settings.hints.username_placeholder",
              )}
              value={tempUsername}
            />
          </div>
          <div>
            <div className="mb-2 text-color-2 text-sm">
              {t("preference.settings.sync_settings.label.secret_key")}
            </div>
            <Input.Password
              onChange={(e) => setTempKey(e.target.value)}
              placeholder={t(
                "preference.settings.sync_settings.hints.secret_key_placeholder",
              )}
              value={tempKey}
            />
          </div>
        </Flex>
      </Modal>
    </>
  );
};

export default Sync;
