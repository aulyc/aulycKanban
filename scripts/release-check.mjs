import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { getReleaseChannel, parseSemVer } from '../version-bump.mjs';

async function readJson(filePath) {
	return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function checkRelease(rootDir = process.cwd()) {
	const packagePath = path.join(rootDir, 'package.json');
	const lockPath = path.join(rootDir, 'package-lock.json');
	const manifestPath = path.join(rootDir, 'manifest.json');
	const distManifestPath = path.join(rootDir, 'dist', 'manifest.json');
	const versionsPath = path.join(rootDir, 'versions.json');

	const [packageJson, lock, manifest, distManifest, versions] = await Promise.all([
		readJson(packagePath),
		readJson(lockPath),
		readJson(manifestPath),
		readJson(distManifestPath),
		readJson(versionsPath),
	]);
	const versionEntries = {
		'package.json': packageJson.version,
		'package-lock.json': lock.version,
		'package-lock.json root package': lock.packages?.['']?.version,
		'manifest.json': manifest.version,
		'dist/manifest.json': distManifest.version,
	};
	const targetVersion = packageJson.version;

	if (!parseSemVer(targetVersion)) {
		throw new Error(`Invalid semantic version in package.json: ${String(targetVersion)}`);
	}
	if (!getReleaseChannel(targetVersion)) {
		throw new Error(
			`Public releases must be stable or use alpha.N, beta.N, or rc.N: ${targetVersion}`,
		);
	}

	for (const [source, value] of Object.entries(versionEntries)) {
		if (value !== targetVersion) {
			throw new Error(`Version mismatch: ${source}=${String(value)}, expected=${targetVersion}`);
		}
	}
	if (versions[targetVersion] !== manifest.minAppVersion) {
		throw new Error(
			`Compatibility mismatch: versions.json=${String(versions[targetVersion])}, `
			+ `manifest.minAppVersion=${String(manifest.minAppVersion)}`,
		);
	}

	for (const fileName of ['main.js', 'manifest.json', 'styles.css']) {
		const [sourceFile, distFile] = await Promise.all([
			readFile(path.join(rootDir, fileName)),
			readFile(path.join(rootDir, 'dist', fileName)),
		]);
		if (!sourceFile.equals(distFile)) {
			throw new Error(`Stale dist artifact: dist/${fileName}`);
		}
	}

	return { version: targetVersion, channel: getReleaseChannel(targetVersion).channel };
}

async function main() {
	const result = await checkRelease();
	console.log(`[release] Verified ${result.version} (${result.channel})`);
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
	await main();
}
