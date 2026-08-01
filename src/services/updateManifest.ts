export type UpdateSource = 'github' | 'gitee';

export interface UpdateDownload {
	source: UpdateSource;
	url: string;
}

export interface UpdateFileReference {
	file: string;
	sha256: string;
	downloads: [UpdateDownload, UpdateDownload];
}

export interface UpdateManifest {
	$schema: string;
	schemaVersion: 1;
	policy: 'aulyc-dual-mirror-v1';
	releaseProfile: 'obsidian-plugin';
	releaseChannel: 'formal';
	version: string;
	buildNumber: number;
	tag: string;
	commit: string;
	bundleIdentifier: null;
	pluginIdentifier: 'aulyckanban';
	architecture: null;
	releasePageURL: string;
	artifact: UpdateFileReference;
	provenance: UpdateFileReference;
}

interface SemanticVersion {
	major: number;
	minor: number;
	patch: number;
	prerelease: string[];
}

const UPDATE_SCHEMA = 'urn:codex-engineering-standards:dual-mirror-latest:1';
const PLUGIN_ID = 'aulyckanban';
const RELEASE_PROFILE = 'obsidian-plugin';
const RELEASE_POLICY = 'aulyc-dual-mirror-v1';
const RELEASE_REPOSITORY = 'aulyc/aulycKanban-releases';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/u;
const MANIFEST_KEYS = [
	'$schema',
	'schemaVersion',
	'policy',
	'releaseProfile',
	'releaseChannel',
	'version',
	'buildNumber',
	'tag',
	'commit',
	'bundleIdentifier',
	'pluginIdentifier',
	'architecture',
	'releasePageURL',
	'artifact',
	'provenance',
] as const;

function record(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function assertExactKeys(
	value: Record<string, unknown>,
	keys: readonly string[],
	label: string,
): void {
	const actual = Object.keys(value).sort().join('\0');
	const expected = [...keys].sort().join('\0');
	if (actual !== expected) throw new Error(`${label} contains unexpected or missing fields`);
}

function text(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be text`);
	return value;
}

function positiveInteger(value: unknown, label: string): number {
	if (!Number.isSafeInteger(value) || Number(value) < 1) {
		throw new Error(`${label} must be a positive integer`);
	}
	return Number(value);
}

function sha256(value: unknown, label: string): string {
	const parsed = text(value, label);
	if (!SHA256_PATTERN.test(parsed)) throw new Error(`${label} must be a lowercase SHA-256`);
	return parsed;
}

function commit(value: unknown, label: string): string {
	const parsed = text(value, label);
	if (!COMMIT_PATTERN.test(parsed)) throw new Error(`${label} must be a lowercase Git commit`);
	return parsed;
}

function parseSemanticVersion(value: unknown, label: string): SemanticVersion {
	const parsed = text(value, label);
	const match = SEMVER_PATTERN.exec(parsed);
	if (!match) throw new Error(`${label} must be a semantic version`);
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4]?.split('.') ?? [],
	};
}

export function compareSemVer(left: string, right: string): number {
	const a = parseSemanticVersion(left, 'left version');
	const b = parseSemanticVersion(right, 'right version');
	for (const key of ['major', 'minor', 'patch'] as const) {
		if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
	}
	if (a.prerelease.length === 0 || b.prerelease.length === 0) {
		if (a.prerelease.length === b.prerelease.length) return 0;
		return a.prerelease.length === 0 ? 1 : -1;
	}
	for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
		const leftPart = a.prerelease[index];
		const rightPart = b.prerelease[index];
		if (leftPart === undefined || rightPart === undefined) return leftPart === undefined ? -1 : 1;
		if (leftPart === rightPart) continue;
		const leftNumeric = /^\d+$/u.test(leftPart);
		const rightNumeric = /^\d+$/u.test(rightPart);
		if (leftNumeric && rightNumeric) return Number(leftPart) < Number(rightPart) ? -1 : 1;
		if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
		return leftPart < rightPart ? -1 : 1;
	}
	return 0;
}

function assertStableVersion(value: unknown, label: string): string {
	const parsed = text(value, label);
	if (parseSemanticVersion(parsed, label).prerelease.length > 0) {
		throw new Error(`${label} must be a stable semantic version`);
	}
	return parsed;
}

function assertReleaseUrl(value: unknown, expectedHost: string, expectedPath: string): string {
	const parsed = text(value, 'download URL');
	let url: URL;
	try {
		url = new URL(parsed);
	} catch {
		throw new Error('Download URL is invalid');
	}
	if (
		url.protocol !== 'https:' ||
		url.hostname !== expectedHost ||
		url.port ||
		url.username ||
		url.password ||
		url.search ||
		url.hash ||
		url.pathname !== expectedPath
	) {
		throw new Error('Download URL host or path is not allowed');
	}
	return parsed;
}

function parseDownloads(
	value: unknown,
	version: string,
	file: string,
): [UpdateDownload, UpdateDownload] {
	if (!Array.isArray(value) || value.length !== 2) {
		throw new Error('Update downloads must contain GitHub then Gitee');
	}
	const expected: Array<{ source: UpdateSource; host: string; path: string }> = [
		{
			source: 'github',
			host: 'github.com',
			path: `/${RELEASE_REPOSITORY}/releases/download/${version}/${file}`,
		},
		{
			source: 'gitee',
			host: 'gitee.com',
			path: `/${RELEASE_REPOSITORY}/releases/download/${version}/${file}`,
		},
	];
	return expected.map((identity, index) => {
		const item = record(value[index], 'update download');
		assertExactKeys(item, ['source', 'url'], 'update download');
		if (item['source'] !== identity.source)
			throw new Error('Update download source order is invalid');
		return {
			source: identity.source,
			url: assertReleaseUrl(item['url'], identity.host, identity.path),
		};
	}) as [UpdateDownload, UpdateDownload];
}

function parseFileReference(
	value: unknown,
	version: string,
	kind: 'artifact' | 'provenance',
): UpdateFileReference {
	const item = record(value, `update ${kind}`);
	assertExactKeys(item, ['file', 'sha256', 'downloads'], `update ${kind}`);
	const expectedFile =
		kind === 'artifact'
			? `aulycKanban-${version}.zip`
			: `aulycKanban-${version}.release-provenance.json`;
	if (item['file'] !== expectedFile) throw new Error(`Update ${kind} file name is invalid`);
	return {
		file: expectedFile,
		sha256: sha256(item['sha256'], `update ${kind} SHA-256`),
		downloads: parseDownloads(item['downloads'], version, expectedFile),
	};
}

export function parseUpdateManifest(value: unknown): UpdateManifest {
	const manifest = record(value, 'update manifest');
	assertExactKeys(manifest, MANIFEST_KEYS, 'update manifest');
	if (manifest['$schema'] !== UPDATE_SCHEMA || manifest['schemaVersion'] !== 1) {
		throw new Error('Update manifest schema is unsupported');
	}
	if (manifest['policy'] !== RELEASE_POLICY) throw new Error('Update policy is invalid');
	if (manifest['releaseProfile'] !== RELEASE_PROFILE) throw new Error('Update profile is invalid');
	if (manifest['releaseChannel'] !== 'formal') throw new Error('Update channel is invalid');
	const version = assertStableVersion(manifest['version'], 'update version');
	if (manifest['tag'] !== version) throw new Error('Update tag must equal version');
	if (manifest['pluginIdentifier'] !== PLUGIN_ID) throw new Error('Update plugin ID is invalid');
	if (manifest['bundleIdentifier'] !== null || manifest['architecture'] !== null) {
		throw new Error('Obsidian update contains foreign platform identity');
	}
	const expectedReleasePage = `https://github.com/${RELEASE_REPOSITORY}/releases/tag/${version}`;
	if (manifest['releasePageURL'] !== expectedReleasePage) {
		throw new Error('Update release page URL is invalid');
	}
	return {
		$schema: UPDATE_SCHEMA,
		schemaVersion: 1,
		policy: RELEASE_POLICY,
		releaseProfile: RELEASE_PROFILE,
		releaseChannel: 'formal',
		version,
		buildNumber: positiveInteger(manifest['buildNumber'], 'update build number'),
		tag: version,
		commit: commit(manifest['commit'], 'update commit'),
		bundleIdentifier: null,
		pluginIdentifier: PLUGIN_ID,
		architecture: null,
		releasePageURL: expectedReleasePage,
		artifact: parseFileReference(manifest['artifact'], version, 'artifact'),
		provenance: parseFileReference(manifest['provenance'], version, 'provenance'),
	};
}
