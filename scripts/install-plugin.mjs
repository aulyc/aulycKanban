import { cp, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultVaultPath = "/Users/crp/Documents/Obsidian/my_vault";
const vaultPath = path.resolve(process.env.OBSIDIAN_VAULT_PATH?.trim() || defaultVaultPath);
const obsidianDir = path.join(vaultPath, ".obsidian");

try {
	const obsidianStat = await stat(obsidianDir);
	if (!obsidianStat.isDirectory()) {
		throw new Error("not a directory");
	}
} catch {
	throw new Error(`Vault configuration directory not found: ${obsidianDir}`);
}

const distDir = path.join(rootDir, "dist");
const manifest = JSON.parse(await readFile(path.join(distDir, "manifest.json"), "utf8"));
const pluginId = manifest.id;

if (typeof pluginId !== "string" || pluginId.length === 0) {
	throw new Error("dist/manifest.json is missing a valid plugin id");
}

const pluginDir = path.join(obsidianDir, "plugins", pluginId);
const filesToInstall = ["main.js", "manifest.json", "styles.css"];

await mkdir(pluginDir, { recursive: true });

for (const fileName of filesToInstall) {
	const sourcePath = path.join(distDir, fileName);
	const targetPath = path.join(pluginDir, fileName);
	await cp(sourcePath, targetPath);

	const [source, installed] = await Promise.all([
		readFile(sourcePath),
		readFile(targetPath),
	]);
	if (!source.equals(installed)) {
		throw new Error(`Installed file verification failed: ${fileName}`);
	}
}

console.log(`[install] Installed ${pluginId} ${manifest.version} to ${pluginDir}`);
console.log("[install] Preserved runtime data.json");
