import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

async function readJson(filePath) {
	return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
	await writeFile(filePath, `${JSON.stringify(value, null, '\t')}\n`, 'utf8');
}

/**
 * Keep Obsidian's manifest and compatibility map aligned with package.json.
 * npm updates package.json/package-lock.json before invoking this lifecycle script.
 */
export async function syncVersionFiles({
	rootDir = process.cwd(),
	version,
} = {}) {
	const packagePath = path.join(rootDir, 'package.json');
	const manifestPath = path.join(rootDir, 'manifest.json');
	const versionsPath = path.join(rootDir, 'versions.json');

	const [packageJson, manifest, versions] = await Promise.all([
		readJson(packagePath),
		readJson(manifestPath),
		readJson(versionsPath),
	]);
	const targetVersion = version ?? packageJson.version;

	if (typeof targetVersion !== 'string' || !VERSION_PATTERN.test(targetVersion)) {
		throw new Error(`Invalid release version: ${String(targetVersion)}`);
	}
	if (packageJson.version !== targetVersion) {
		throw new Error(
			`Version mismatch: package.json=${String(packageJson.version)}, target=${targetVersion}`,
		);
	}
	if (typeof manifest.minAppVersion !== 'string' || manifest.minAppVersion.length === 0) {
		throw new Error('manifest.json must define minAppVersion before bumping the version');
	}

	const nextManifest = { ...manifest, version: targetVersion };
	const nextVersions = { ...versions, [targetVersion]: manifest.minAppVersion };

	await Promise.all([
		writeJson(manifestPath, nextManifest),
		writeJson(versionsPath, nextVersions),
	]);

	return { version: targetVersion, minAppVersion: manifest.minAppVersion };
}

async function main() {
	const result = await syncVersionFiles({ version: process.env.npm_package_version });
	console.log(
		`[version] Synced ${result.version} with minimum Obsidian ${result.minAppVersion}`,
	);
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
	await main();
}
