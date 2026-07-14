import { proxy } from "valtio";
import type { GlobalStore } from "@/types/store";

export const globalStore = proxy<GlobalStore>({
  app: {
    autoStart: false,
    showMenubarIcon: true,
    showTaskbarIcon: false,
    silentStart: false,
  },

  appearance: {
    isDark: false,
    theme: "auto",
  },

  env: {},

  lanSync: {
    enabled: false,
    port: 19527,
  },

  realtimeSync: {
    enabled: false,
    mode: "remote",
  },

  shortcut: {
    clipboard: "Alt+C",
    linkPrompt: "",
    pastePlain: "",
    preference: "Alt+X",
    quickPaste: {
      enable: false,
      value: "Command+Shift",
    },
  },

  sync: {
    enabled: false,
    secretKey: "",
    serverUrl: "",
    username: "",
  },

  update: {
    auto: true,
    beta: false,
  },
});
