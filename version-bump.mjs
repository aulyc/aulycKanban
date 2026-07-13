import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseSemVer(value) {
	if (typeof value !== 'string') return null;
	const match = VERSION_PATTERN.exec(value);
	if (!match) return null;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4]?.split('.') ?? [],
		build: match[5]?.split('.') ?? [],
	};
}

export function compareSemVer(left, right) {
	const leftVersion = parseSemVer(left);
	const rightVersion = parseSemVer(right);
	if (!leftVersion || !rightVersion) throw new Error('Cannot compare invalid semantic versions');

	for (const key of ['major', 'minor', 'patch']) {
		const difference = leftVersion[key] - rightVersion[key];
		if (difference !== 0) return Math.sign(difference);
	}

	const leftPre = leftVersion.prerelease;
	const rightPre = rightVersion.prerelease;
	if (leftPre.length === 0 || rightPre.length === 0) {
		if (leftPre.length === rightPre.length) return 0;
		return leftPre.length === 0 ? 1 : -1;
	}

	for (let index = 0; index < Math.max(leftPre.length, rightPre.length); index += 1) {
		const leftPart = leftPre[index];
		const rightPart = rightPre[index];
		if (leftPart === undefined || rightPart === undefined) {
			return leftPart === undefined ? -1 : 1;
		}
		if (leftPart === rightPart) continue;
		const leftIsNumber = /^\d+$/.test(leftPart);
		const rightIsNumber = /^\d+$/.test(rightPart);
		if (leftIsNumber && rightIsNumber) return Math.sign(Number(leftPart) - Number(rightPart));
		if (leftIsNumber !== rightIsNumber) return leftIsNumber ? -1 : 1;
		return leftPart < rightPart ? -1 : 1;
	}

	return 0;
}

export function getReleaseChannel(value) {
	const parsed = parseSemVer(value);
	if (!parsed) return null;
	if (parsed.build.length > 0) return null;
	if (parsed.prerelease.length === 0) return { channel: 'stable', sequence: null };
	const match = /^(alpha|beta|rc)\.([1-9]\d*)$/.exec(parsed.prerelease.join('.'));
	return match ? { channel: match[1], sequence: Number(match[2]) } : null;
}

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

	if (!parseSemVer(targetVersion)) {
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
	if (!(targetVersion in versions)) {
		const previousVersions = Object.keys(versions).filter((value) => parseSemVer(value));
		const latestVersion = previousVersions.sort(compareSemVer).at(-1);
		if (latestVersion && compareSemVer(targetVersion, latestVersion) <= 0) {
			throw new Error(`Version must advance beyond ${latestVersion}: ${targetVersion}`);
		}
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
