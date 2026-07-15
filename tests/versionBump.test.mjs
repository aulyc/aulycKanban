import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	checkVersionFiles,
	compareSemVer,
	getReleaseChannel,
	parseSemVer,
	setReleaseVersion,
	syncVersionFiles,
} from '../version-bump.mjs';

async function writeJson(filePath, value) {
	await writeFile(filePath, `${JSON.stringify(value, null, '\t')}\n`, 'utf8');
}

async function readJson(filePath) {
	return JSON.parse(await readFile(filePath, 'utf8'));
}

async function createFixture({ version = '2.1.19', buildNumber = 0 } = {}) {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-version-'));
	await mkdir(path.join(rootDir, 'dist'));
	const oldVersion = '2.1.18';
	const manifest = {
		id: 'aulyckanban',
		version: oldVersion,
		minAppVersion: '1.5.0',
		isDesktopOnly: false,
	};
	await Promise.all([
		writeJson(path.join(rootDir, 'release-version.json'), { version, buildNumber }),
		writeJson(path.join(rootDir, 'package.json'), { name: 'aulyckanban', version: oldVersion }),
		writeJson(path.join(rootDir, 'package-lock.json'), {
			name: 'aulyckanban',
			version: oldVersion,
			packages: { '': { name: 'aulyckanban', version: oldVersion } },
		}),
		writeJson(path.join(rootDir, 'manifest.json'), manifest),
		writeJson(path.join(rootDir, 'dist', 'manifest.json'), manifest),
		writeJson(path.join(rootDir, 'versions.json'), { [oldVersion]: '1.5.0' }),
	]);
	return rootDir;
}

test('authoritative version sync updates every derived product version', async () => {
	const rootDir = await createFixture();
	try {
		const result = await syncVersionFiles({ rootDir });
		assert.deepEqual(result, {
			version: '2.1.19',
			buildNumber: 0,
			minAppVersion: '1.5.0',
		});
		assert.equal((await readJson(path.join(rootDir, 'package.json'))).version, '2.1.19');
		const lock = await readJson(path.join(rootDir, 'package-lock.json'));
		assert.equal(lock.version, '2.1.19');
		assert.equal(lock.packages[''].version, '2.1.19');
		assert.equal((await readJson(path.join(rootDir, 'manifest.json'))).version, '2.1.19');
		assert.equal((await readJson(path.join(rootDir, 'dist', 'manifest.json'))).version, '2.1.19');
		assert.equal((await readJson(path.join(rootDir, 'versions.json')))['2.1.19'], '1.5.0');
		await checkVersionFiles(rootDir);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('version check fails closed on any derived version drift', async () => {
	const rootDir = await createFixture();
	try {
		await syncVersionFiles({ rootDir });
		const manifest = await readJson(path.join(rootDir, 'dist', 'manifest.json'));
		await writeJson(path.join(rootDir, 'dist', 'manifest.json'), {
			...manifest,
			version: '2.1.18',
		});
		await assert.rejects(
			checkVersionFiles(rootDir),
			/Version drift detected in dist\/manifest\.json/,
		);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('semantic versions support multi-digit fields and ordered prereleases', () => {
	assert.notEqual(parseSemVer('2.0.10'), null);
	assert.notEqual(parseSemVer('2.2.0-beta.1'), null);
	assert.equal(compareSemVer('2.0.10', '2.0.9'), 1);
	assert.equal(compareSemVer('2.2.0-beta.2', '2.2.0-beta.1'), 1);
	assert.equal(compareSemVer('2.2.0-rc.1', '2.2.0-beta.9'), 1);
	assert.equal(compareSemVer('2.2.0', '2.2.0-rc.1'), 1);
});

test('release channels only accept stable or numbered alpha, beta, and rc versions', () => {
	assert.deepEqual(getReleaseChannel('2.2.0'), { channel: 'formal', sequence: null });
	assert.deepEqual(getReleaseChannel('2.2.0-alpha.1'), {
		channel: 'test',
		stage: 'alpha',
		sequence: 1,
	});
	assert.deepEqual(getReleaseChannel('2.2.0-beta.3'), {
		channel: 'test',
		stage: 'beta',
		sequence: 3,
	});
	assert.equal(getReleaseChannel('2.2.0-preview.1'), null);
	assert.equal(getReleaseChannel('2.2.0+build.5'), null);
	assert.equal(parseSemVer('2.2.0-beta.01'), null);
});

test('build number must be an integer and zero is limited to the 2.1.19 migration', async () => {
	for (const releaseVersion of [
		{ version: '2.1.19', buildNumber: 1.5 },
		{ version: '2.1.19', buildNumber: -1 },
		{ version: '2.2.0', buildNumber: 0 },
	]) {
		const rootDir = await createFixture(releaseVersion);
		try {
			await assert.rejects(checkVersionFiles(rootDir), /buildNumber|buildNumber 0/);
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	}
});

test('future version preparation requires a new SemVer and strictly increasing build number', async () => {
	const rootDir = await createFixture();
	try {
		await syncVersionFiles({ rootDir });
		await assert.rejects(
			setReleaseVersion({ rootDir, version: '2.1.19', buildNumber: 1 }),
			/Version must advance beyond 2\.1\.19/,
		);
		await assert.rejects(
			setReleaseVersion({ rootDir, version: '2.1.20', buildNumber: 0 }),
			/buildNumber 0 is reserved/,
		);
		assert.deepEqual(
			await setReleaseVersion({ rootDir, version: '2.1.20-beta.1', buildNumber: 1 }),
			{ version: '2.1.20-beta.1', buildNumber: 1 },
		);
		await assert.rejects(
			setReleaseVersion({ rootDir, version: '2.1.20-beta.2', buildNumber: 1 }),
			/buildNumber must strictly increase beyond 1/,
		);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});
