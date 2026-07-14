import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installScript = path.join(rootDir, "scripts", "install-plugin.mjs");
const filesToInstall = ["main.js", "manifest.json", "styles.css"];

test("local installer copies only release artifacts and preserves data.json", async () => {
	const vaultPath = await mkdtemp(path.join(tmpdir(), "aulyckanban-vault-"));
	const pluginDir = path.join(vaultPath, ".obsidian", "plugins", "aulyckanban");

	try {
		await mkdir(pluginDir, { recursive: true });
		await writeFile(path.join(pluginDir, "data.json"), "runtime-data");

		const result = spawnSync(process.execPath, [installScript], {
			cwd: rootDir,
			env: { ...process.env, OBSIDIAN_VAULT_PATH: vaultPath },
			encoding: "utf8",
		});

		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /Installed aulyckanban/);
		assert.equal(await readFile(path.join(pluginDir, "data.json"), "utf8"), "runtime-data");
		assert.deepEqual((await readdir(pluginDir)).sort(), ["data.json", ...filesToInstall].sort());

		for (const fileName of filesToInstall) {
			const [source, installed] = await Promise.all([
				readFile(path.join(rootDir, "dist", fileName)),
				readFile(path.join(pluginDir, fileName)),
			]);
			assert.deepEqual(installed, source);
		}
	} finally {
		await rm(vaultPath, { recursive: true, force: true });
	}
});

test("local installer refuses a folder that is not an Obsidian vault", async () => {
	const folderPath = await mkdtemp(path.join(tmpdir(), "aulyckanban-not-vault-"));

	try {
		const result = spawnSync(process.execPath, [installScript], {
			cwd: rootDir,
			env: { ...process.env, OBSIDIAN_VAULT_PATH: folderPath },
			encoding: "utf8",
		});

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Vault configuration directory not found/);
	} finally {
		await rm(folderPath, { recursive: true, force: true });
	}
});
