import { spawnSync } from 'node:child_process';
import { lstat, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyReleaseArtifact } from './artifact.mjs';
import { RELEASE_FILES, sha256Buffer } from './release-constants.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseCliOutput(value) {
	const output = typeof value === 'string' ? value.trim() : '';
	if (output.startsWith('"') && output.endsWith('"')) {
		try {
			return JSON.parse(output);
		} catch {
			return output;
		}
	}
	return output;
}

export function discoverVaultPath({
	vaultPath,
	env = process.env,
	runner = spawnSync,
	cli = env.OBSIDIAN_CLI?.trim() || 'obsidian',
	vaultName = env.OBSIDIAN_VAULT_NAME?.trim() || '',
} = {}) {
	const explicit = vaultPath?.trim() || env.OBSIDIAN_VAULT_PATH?.trim();
	if (explicit) return path.resolve(explicit);
	const args = [
		...(vaultName ? [`vault=${vaultName}`] : []),
		'eval',
		'code=app.vault.adapter.basePath',
	];
	const result = runner(cli, args, { encoding: 'utf8' });
	if (result.error?.code === 'ENOENT') throw new Error(`Obsidian CLI not found: ${cli}`);
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`Unable to discover Vault with Obsidian CLI: ${(result.stderr || '').trim()}`);
	}
	const discovered = parseCliOutput(result.stdout);
	if (typeof discovered !== 'string' || !path.isAbsolute(discovered)) {
		throw new Error('Obsidian CLI did not return an absolute Vault path');
	}
	return path.resolve(discovered);
}

async function assertVault(vaultPath) {
	const obsidianDir = path.join(vaultPath, '.obsidian');
	try {
		const info = await lstat(obsidianDir);
		if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('not a real directory');
	} catch {
		throw new Error(`Vault configuration directory not found: ${obsidianDir}`);
	}
	return obsidianDir;
}

async function atomicWrite(filePath, data) {
	const temporaryPath = `${filePath}.aulycKanban-install-${process.pid}`;
	await writeFile(temporaryPath, data, { flag: 'wx' });
	await rename(temporaryPath, filePath);
}

export async function installReleaseArtifact({
	repoDir = rootDir,
	zipPath,
	provenancePath,
	expectedChannel = 'formal',
	vaultPath,
	env = process.env,
	runner = spawnSync,
} = {}) {
	if (!zipPath || !provenancePath) {
		throw new Error(
			'Installer requires explicit --zip and --provenance inputs; dist fallback is forbidden',
		);
	}
	const verified = await verifyReleaseArtifact({
		repoDir,
		zipPath: path.resolve(zipPath),
		provenancePath: path.resolve(provenancePath),
		expectedChannel,
	});
	const targetVault = discoverVaultPath({ vaultPath, env, runner });
	const obsidianDir = await assertVault(targetVault);
	const pluginDir = path.join(obsidianDir, 'plugins', verified.manifest.id);
	try {
		const info = await lstat(pluginDir);
		if (!info.isDirectory() || info.isSymbolicLink()) {
			throw new Error(`Plugin target must be a real directory: ${pluginDir}`);
		}
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
		await mkdir(pluginDir, { recursive: true });
	}
	for (const fileName of RELEASE_FILES) {
		const entry = verified.entries.find((candidate) => candidate.name === fileName);
		await atomicWrite(path.join(pluginDir, fileName), entry.data);
	}
	for (const expected of verified.provenance.files) {
		const installed = await readFile(path.join(pluginDir, expected.file));
		if (sha256Buffer(installed) !== expected.sha256) {
			throw new Error(`Installed file SHA-256 mismatch: ${expected.file}`);
		}
	}
	const installedManifest = JSON.parse(
		await readFile(path.join(pluginDir, 'manifest.json'), 'utf8'),
	);
	if (
		installedManifest.id !== verified.provenance.pluginId ||
		installedManifest.version !== verified.provenance.version
	) {
		throw new Error('Installed manifest identity does not match verified release provenance');
	}
	return {
		pluginDir,
		manifestPath: path.join(pluginDir, 'manifest.json'),
		manifest: installedManifest,
		provenance: verified.provenance,
	};
}

function parseArguments(argv) {
	const values = {};
	const allowed = new Set(['zip', 'provenance', 'channel', 'vault']);
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (!argument.startsWith('--')) throw new Error(`Unknown installer argument: ${argument}`);
		const key = argument.slice(2);
		if (!allowed.has(key)) throw new Error(`Unknown installer option: --${key}`);
		const value = argv[index + 1];
		if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
		values[key] = value;
		index += 1;
	}
	return values;
}

async function main() {
	const args = parseArguments(process.argv.slice(2));
	const result = await installReleaseArtifact({
		zipPath: args.zip,
		provenancePath: args.provenance,
		expectedChannel: args.channel || 'formal',
		vaultPath: args.vault,
	});
	console.log(
		`[install] Installed ${result.manifest.name ?? result.manifest.id} ${result.manifest.version} (plugin id: ${result.manifest.id})`,
	);
	console.log('[install] Verified three release files and preserved runtime data');
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
	try {
		await main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
