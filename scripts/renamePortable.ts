import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const packageJsonPath = path.resolve(projectRoot, "package.json");

try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  const version = packageJson.version;

  // Define paths
  const releaseDir = path.resolve(projectRoot, "target", "release");
  const sourceExe = path.join(releaseDir, "PasteX.exe");
  const targetExe = path.join(releaseDir, `PasteX_${version}_x64-portable.exe`);

  if (fs.existsSync(sourceExe)) {
    fs.copyFileSync(sourceExe, targetExe);
    process.stdout.write(`Generated portable executable: ${targetExe}\n`);
  } else {
    process.stderr.write(`Source executable not found: ${sourceExe}\n`);
    // Check src-tauri/target/release
    const fallbackReleaseDir = path.resolve(
      projectRoot,
      "src-tauri",
      "target",
      "release",
    );
    const fallbackSource = path.join(fallbackReleaseDir, "PasteX.exe");
    if (fs.existsSync(fallbackSource)) {
      fs.copyFileSync(fallbackSource, targetExe);
      process.stdout.write(
        `Generated portable executable from fallback source: ${targetExe}\n`,
      );
    } else {
      process.exit(1);
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error generating portable name: ${message}\n`);
  process.exit(1);
}
