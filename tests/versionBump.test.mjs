import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	compareSemVer,
	getReleaseChannel,
	parseSemVer,
	syncVersionFiles,
} from '../version-bump.mjs';

async function writeJson(filePath, value) {
	await writeFile(filePath, `${JSON.stringify(value, null, '\t')}\n`, 'utf8');
}

async function readJson(filePath) {
	return JSON.parse(await readFile(filePath, 'utf8'));
}

async function createFixture(packageVersion = '2.2.0') {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-version-'));
	await Promise.all([
		writeJson(path.join(rootDir, 'package.json'), { version: packageVersion }),
		writeJson(path.join(rootDir, 'manifest.json'), {
			id: 'aulyckanban',
			version: '2.1.2',
			minAppVersion: '1.5.0',
		}),
		writeJson(path.join(rootDir, 'versions.json'), { '2.1.2': '1.5.0' }),
	]);
	return rootDir;
}

test('version bump syncs manifest and preserves the compatibility history', async () => {
	const rootDir = await createFixture();
	try {
		const result = await syncVersionFiles({ rootDir, version: '2.2.0' });
		const manifest = await readJson(path.join(rootDir, 'manifest.json'));
		const versions = await readJson(path.join(rootDir, 'versions.json'));

		assert.deepEqual(result, { version: '2.2.0', minAppVersion: '1.5.0' });
		assert.equal(manifest.version, '2.2.0');
		assert.deepEqual(versions, {
			'2.1.2': '1.5.0',
			'2.2.0': '1.5.0',
		});
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('semantic versions support multi-digit patches and ordered prereleases', () => {
	assert.notEqual(parseSemVer('2.0.10'), null);
	assert.notEqual(parseSemVer('2.2.0-beta.1'), null);
	assert.equal(compareSemVer('2.0.10', '2.0.9'), 1);
	assert.equal(compareSemVer('2.2.0-beta.2', '2.2.0-beta.1'), 1);
	assert.equal(compareSemVer('2.2.0-rc.1', '2.2.0-beta.9'), 1);
	assert.equal(compareSemVer('2.2.0', '2.2.0-rc.1'), 1);
});

test('release channels are limited to stable, alpha, beta, and rc sequences', () => {
	assert.deepEqual(getReleaseChannel('2.2.0'), { channel: 'stable', sequence: null });
	assert.deepEqual(getReleaseChannel('2.2.0-alpha.1'), { channel: 'alpha', sequence: 1 });
	assert.deepEqual(getReleaseChannel('2.2.0-beta.3'), { channel: 'beta', sequence: 3 });
	assert.deepEqual(getReleaseChannel('2.2.0-rc.2'), { channel: 'rc', sequence: 2 });
	assert.equal(getReleaseChannel('2.2.0-preview.1'), null);
	assert.equal(getReleaseChannel('2.2.0+build.5'), null);
});

test('version bump rejects a target that differs from package.json', async () => {
	const rootDir = await createFixture();
	try {
		await assert.rejects(
			syncVersionFiles({ rootDir, version: '2.2.1' }),
			/Version mismatch: package\.json=2\.2\.0, target=2\.2\.1/,
		);
		assert.equal((await readJson(path.join(rootDir, 'manifest.json'))).version, '2.1.2');
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('version bump rejects non-numeric three-part versions', async () => {
	const rootDir = await createFixture('2.2');
	try {
		await assert.rejects(syncVersionFiles({ rootDir }), /Invalid release version: 2\.2/);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('version bump rejects malformed prereleases and version rollback', async () => {
	assert.equal(parseSemVer('v2.2.0'), null);
	assert.equal(parseSemVer('2.02.0'), null);
	assert.equal(parseSemVer('2.2.0-beta.01'), null);

	const rootDir = await createFixture('2.1.1');
	try {
		await assert.rejects(
			syncVersionFiles({ rootDir, version: '2.1.1' }),
			/Version must advance beyond 2\.1\.2: 2\.1\.1/,
		);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});
