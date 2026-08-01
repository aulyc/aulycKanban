import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

const { LATEST_MANIFEST_URLS, UpdateService } = await loadSourceModule(
	'src/services/updateService.ts',
	{ label: 'update-service' },
);

const encoder = new TextEncoder();
const asBuffer = (value) => {
	const bytes = encoder.encode(value);
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

function fixture(overrides = {}) {
	const version = '2.9.0';
	const artifactFile = `aulycKanban-${version}.zip`;
	const provenanceFile = `aulycKanban-${version}.release-provenance.json`;
	const downloads = (file) => [
		{
			source: 'github',
			url: `https://github.com/aulyc/aulycKanban-releases/releases/download/${version}/${file}`,
		},
		{
			source: 'gitee',
			url: `https://gitee.com/aulyc/aulycKanban-releases/releases/download/${version}/${file}`,
		},
	];
	return asBuffer(
		JSON.stringify({
			$schema: 'urn:codex-engineering-standards:dual-mirror-latest:1',
			schemaVersion: 1,
			policy: 'aulyc-dual-mirror-v1',
			releaseProfile: 'obsidian-plugin',
			releaseChannel: 'formal',
			version,
			buildNumber: 39,
			tag: version,
			commit: 'a'.repeat(40),
			bundleIdentifier: null,
			pluginIdentifier: 'aulyckanban',
			architecture: null,
			releasePageURL: `https://github.com/aulyc/aulycKanban-releases/releases/tag/${version}`,
			artifact: { file: artifactFile, sha256: 'b'.repeat(64), downloads: downloads(artifactFile) },
			provenance: {
				file: provenanceFile,
				sha256: 'c'.repeat(64),
				downloads: downloads(provenanceFile),
			},
			...overrides,
		}),
	);
}

function fetcher(responses, calls) {
	return async (url) => {
		calls.push(url);
		const response = responses.get(url);
		if (response instanceof Error) throw response;
		if (!response) throw new Error(`Unexpected URL: ${url}`);
		return response;
	};
}

test('checks GitHub first and falls back to Gitee for a valid latest manifest', async () => {
	const calls = [];
	const responses = new Map([
		[LATEST_MANIFEST_URLS[0].url, new Error('GitHub unavailable')],
		[LATEST_MANIFEST_URLS[1].url, fixture()],
	]);
	const service = new UpdateService(fetcher(responses, calls));

	const result = await service.check('2.8.2');

	assert.equal(result.status, 'update-available');
	assert.equal(result.source, 'gitee');
	assert.equal(result.manifest.version, '2.9.0');
	assert.deepEqual(
		calls,
		LATEST_MANIFEST_URLS.map(({ url }) => url),
	);
});

test('a stalled GitHub request times out before the Gitee fallback runs', async () => {
	const calls = [];
	const service = new UpdateService(async (url) => {
		calls.push(url);
		if (url === LATEST_MANIFEST_URLS[0].url) return new Promise(() => {});
		return fixture();
	}, 5);

	const result = await Promise.race([
		service.check('2.8.2'),
		new Promise((_, reject) => setTimeout(() => reject(new Error('test timed out')), 100)),
	]);

	assert.equal(result.source, 'gitee');
	assert.deepEqual(
		calls,
		LATEST_MANIFEST_URLS.map(({ url }) => url),
	);
});

test('reports current or newer installed versions without exposing a package download API', async () => {
	const calls = [];
	const responses = new Map([[LATEST_MANIFEST_URLS[0].url, fixture()]]);
	const service = new UpdateService(fetcher(responses, calls));

	assert.equal((await service.check('2.9.0')).status, 'up-to-date');
	assert.equal((await service.check('3.0.0')).status, 'up-to-date');
	assert.equal(service.downloadAndVerify, undefined);
	assert.deepEqual(calls, [LATEST_MANIFEST_URLS[0].url, LATEST_MANIFEST_URLS[0].url]);
});

test('fails closed when neither mirror returns a valid formal manifest', async () => {
	const calls = [];
	const responses = new Map([
		[LATEST_MANIFEST_URLS[0].url, asBuffer('{}')],
		[LATEST_MANIFEST_URLS[1].url, asBuffer('{"version":"evil"}')],
	]);

	await assert.rejects(
		new UpdateService(fetcher(responses, calls)).check('2.8.2'),
		/No trusted update manifest/i,
	);
	assert.deepEqual(
		calls,
		LATEST_MANIFEST_URLS.map(({ url }) => url),
	);
});
