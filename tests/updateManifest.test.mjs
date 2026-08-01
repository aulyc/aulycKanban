import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

const { compareSemVer, parseReleaseProvenance, parseUpdateManifest } = await loadSourceModule(
	new URL('../src/services/updateManifest.ts', import.meta.url),
	{ label: 'update-manifest' },
);

function latest(overrides = {}) {
	return {
		$schema: 'urn:codex-engineering-standards:dual-mirror-latest:1',
		schemaVersion: 1,
		policy: 'aulyc-dual-mirror-v1',
		releaseProfile: 'obsidian-plugin',
		releaseChannel: 'formal',
		version: '2.9.0',
		buildNumber: 39,
		tag: '2.9.0',
		commit: 'a'.repeat(40),
		bundleIdentifier: null,
		pluginIdentifier: 'aulyckanban',
		architecture: null,
		releasePageURL: 'https://github.com/aulyc/aulycKanban-releases/releases/tag/2.9.0',
		artifact: {
			file: 'aulycKanban-2.9.0.zip',
			sha256: 'b'.repeat(64),
			downloads: [
				{
					source: 'github',
					url: 'https://github.com/aulyc/aulycKanban-releases/releases/download/2.9.0/aulycKanban-2.9.0.zip',
				},
				{
					source: 'gitee',
					url: 'https://gitee.com/aulyc/aulycKanban-releases/releases/download/2.9.0/aulycKanban-2.9.0.zip',
				},
			],
		},
		provenance: {
			file: 'aulycKanban-2.9.0.release-provenance.json',
			sha256: 'c'.repeat(64),
			downloads: [
				{
					source: 'github',
					url: 'https://github.com/aulyc/aulycKanban-releases/releases/download/2.9.0/aulycKanban-2.9.0.release-provenance.json',
				},
				{
					source: 'gitee',
					url: 'https://gitee.com/aulyc/aulycKanban-releases/releases/download/2.9.0/aulycKanban-2.9.0.release-provenance.json',
				},
			],
		},
		...overrides,
	};
}

test('parses the exact formal Obsidian update manifest and semantic version ordering', () => {
	const parsed = parseUpdateManifest(latest());
	assert.equal(parsed.version, '2.9.0');
	assert.equal(parsed.pluginIdentifier, 'aulyckanban');
	assert.equal(compareSemVer('2.9.0', '2.8.2'), 1);
	assert.equal(compareSemVer('2.9.0-beta.2', '2.9.0-beta.10'), -1);
	assert.equal(compareSemVer('2.9.0', '2.9.0-rc.1'), 1);
});

test('rejects unknown manifest fields, identity drift, downgrade metadata, and untrusted URLs', () => {
	assert.throws(() => parseUpdateManifest(latest({ unexpected: true })), /fields/i);
	assert.throws(() => parseUpdateManifest(latest({ pluginIdentifier: 'other-plugin' })), /plugin/i);
	assert.throws(() => parseUpdateManifest(latest({ tag: '2.8.9' })), /tag/i);
	const malicious = latest();
	malicious.artifact.downloads[0].url =
		'https://github.com.evil.example/aulyc/aulycKanban-releases/releases/download/2.9.0/aulycKanban-2.9.0.zip';
	assert.throws(() => parseUpdateManifest(malicious), /URL|host/i);
	const reversed = latest();
	reversed.artifact.downloads.reverse();
	assert.throws(() => parseUpdateManifest(reversed), /order|source/i);
});

test('keeps the runtime scope at manifest checking without a package provenance parser', () => {
	assert.equal(parseReleaseProvenance, undefined);
});
