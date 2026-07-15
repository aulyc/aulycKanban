import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const MIGRATION_VERSION = '2.1.19';
const DERIVED_VERSION_FILES = [
	'package.json',
	'package-lock.json',
	'manifest.json',
	'versions.json',
	'dist/manifest.json',
];

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
	if (!parsed || parsed.build.length > 0) return null;
	if (parsed.prerelease.length === 0) return { channel: 'formal', sequence: null };
	const match = /^(alpha|beta|rc)\.([1-9]\d*)$/.exec(parsed.prerelease.join('.'));
	return match ? { channel: 'test', stage: match[1], sequence: Number(match[2]) } : null;
}

function validateReleaseVersion(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('release-version.json must contain an object');
	}
	const keys = Object.keys(value).sort();
	if (keys.join(',') !== 'buildNumber,version') {
		throw new Error('release-version.json may only contain version and buildNumber');
	}
	if (!getReleaseChannel(value.version)) {
		throw new Error(
			`Invalid release version: ${String(value.version)}; use stable SemVer or alpha.N, beta.N, rc.N`,
		);
	}
	if (!Number.isInteger(value.buildNumber) || value.buildNumber < 0) {
		throw new Error('buildNumber must be a non-negative integer');
	}
	if (value.buildNumber === 0 && value.version !== MIGRATION_VERSION) {
		throw new Error(
			`buildNumber 0 is reserved for the unpublished ${MIGRATION_VERSION} migration state`,
		);
	}
	return value;
}

async function readJson(filePath) {
	return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
	await writeFile(filePath, `${JSON.stringify(value, null, '\t')}\n`, 'utf8');
}

async function fileExists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

export async function readReleaseVersion(rootDir = process.cwd()) {
	return validateReleaseVersion(await readJson(path.join(rootDir, 'release-version.json')));
}

async function loadVersionFiles(rootDir) {
	const paths = {
		packageJson: path.join(rootDir, 'package.json'),
		lock: path.join(rootDir, 'package-lock.json'),
		manifest: path.join(rootDir, 'manifest.json'),
		versions: path.join(rootDir, 'versions.json'),
		distManifest: path.join(rootDir, 'dist', 'manifest.json'),
	};
	const [packageJson, lock, manifest, versions] = await Promise.all([
		readJson(paths.packageJson),
		readJson(paths.lock),
		readJson(paths.manifest),
		readJson(paths.versions),
	]);
	const distManifest = await fileExists(paths.distManifest)
		? await readJson(paths.distManifest)
		: null;
	return { paths, packageJson, lock, manifest, versions, distManifest };
}

function deriveVersionFiles(releaseVersion, files) {
	const { version } = releaseVersion;
	if (typeof files.manifest.minAppVersion !== 'string' || !files.manifest.minAppVersion) {
		throw new Error('manifest.json must define minAppVersion');
	}
	if (!files.lock.packages?.['']) {
		throw new Error('package-lock.json is missing the root package entry');
	}

	const previousVersions = Object.keys(files.versions).filter((entry) => parseSemVer(entry));
	const latestVersion = previousVersions.sort(compareSemVer).at(-1);
	if (!(version in files.versions) && latestVersion && compareSemVer(version, latestVersion) <= 0) {
		throw new Error(`Version must advance beyond ${latestVersion}: ${version}`);
	}

	return {
		packageJson: { ...files.packageJson, version },
		lock: {
			...files.lock,
			version,
			packages: {
				...files.lock.packages,
				'': { ...files.lock.packages[''], version },
			},
		},
		manifest: { ...files.manifest, version },
		versions: { ...files.versions, [version]: files.manifest.minAppVersion },
		distManifest: files.distManifest ? { ...files.manifest, version } : null,
	};
}

function assertJsonEqual(source, actual, expected) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Version drift detected in ${source}; run npm run version:sync`);
	}
}

export async function checkVersionFiles(rootDir = process.cwd()) {
	const releaseVersion = await readReleaseVersion(rootDir);
	const files = await loadVersionFiles(rootDir);
	const expected = deriveVersionFiles(releaseVersion, files);
	assertJsonEqual('package.json', files.packageJson, expected.packageJson);
	assertJsonEqual('package-lock.json', files.lock, expected.lock);
	assertJsonEqual('manifest.json', files.manifest, expected.manifest);
	assertJsonEqual('versions.json', files.versions, expected.versions);
	if (!files.distManifest) throw new Error('Version drift detected: dist/manifest.json is missing');
	assertJsonEqual('dist/manifest.json', files.distManifest, expected.distManifest);
	return { ...releaseVersion, derivedFiles: [...DERIVED_VERSION_FILES] };
}

export async function syncVersionFiles({ rootDir = process.cwd() } = {}) {
	const releaseVersion = await readReleaseVersion(rootDir);
	const files = await loadVersionFiles(rootDir);
	const expected = deriveVersionFiles(releaseVersion, files);
	await Promise.all([
		writeJson(files.paths.packageJson, expected.packageJson),
		writeJson(files.paths.lock, expected.lock),
		writeJson(files.paths.manifest, expected.manifest),
		writeJson(files.paths.versions, expected.versions),
		expected.distManifest
			? writeJson(files.paths.distManifest, expected.distManifest)
			: Promise.resolve(),
	]);
	return { ...releaseVersion, minAppVersion: expected.manifest.minAppVersion };
}

export async function setReleaseVersion({ rootDir = process.cwd(), version, buildNumber } = {}) {
	const current = await readReleaseVersion(rootDir);
	const next = validateReleaseVersion({ version, buildNumber });
	if (compareSemVer(next.version, current.version) <= 0) {
		throw new Error(`Version must advance beyond ${current.version}: ${next.version}`);
	}
	if (next.buildNumber <= current.buildNumber) {
		throw new Error(
			`buildNumber must strictly increase beyond ${current.buildNumber}: ${next.buildNumber}`,
		);
	}
	await writeJson(path.join(rootDir, 'release-version.json'), next);
	await syncVersionFiles({ rootDir });
	return next;
}

async function main() {
	const command = process.argv[2] ?? 'sync';
	if (command === 'check') {
		const result = await checkVersionFiles();
		console.log(`[version] Verified ${result.version} (build ${result.buildNumber})`);
		return;
	}
	if (command === 'sync') {
		const result = await syncVersionFiles();
		console.log(`[version] Synced ${result.version} (build ${result.buildNumber})`);
		return;
	}
	if (command === 'set') {
		const buildNumber = Number(process.argv[4]);
		const result = await setReleaseVersion({ version: process.argv[3], buildNumber });
		console.log(`[version] Prepared ${result.version} (build ${result.buildNumber})`);
		return;
	}
	throw new Error(`Unknown version command: ${command}`);
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
