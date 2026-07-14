import { execSync } from "node:child_process";

(() => {
  const { env, platform } = process;

  const isMac = env.PLATFORM?.startsWith("macos") ?? platform === "darwin";

  const logoName = "PasteX";

  const command = `tauri icon src-tauri/assets/${logoName}.png`;

  execSync(command, { stdio: "inherit" });
})();
