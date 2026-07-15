import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkRelease } from '../scripts/release-check.mjs';
import { writeJson } from './helpers/release-fixture.mjs';

async function createCandidate(version = '2.1.19') {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-candidate-'));
	await mkdir(path.join(rootDir, 'dist'));
	const manifest = {
		id: 'aulyckanban',
		version,
		minAppVersion: '1.5.0',
		isDesktopOnly: false,
	};
	await Promise.all([
		writeJson(path.join(rootDir, 'release-version.json'), { version, buildNumber: 0 }),
		writeJson(path.join(rootDir, 'package.json'), { name: 'aulyckanban', version }),
		writeJson(path.join(rootDir, 'package-lock.json'), {
			name: 'aulyckanban',
			version,
			packages: { '': { name: 'aulyckanban', version } },
		}),
		writeJson(path.join(rootDir, 'manifest.json'), manifest),
		writeJson(path.join(rootDir, 'dist', 'manifest.json'), manifest),
		writeJson(path.join(rootDir, 'versions.json'), { [version]: '1.5.0' }),
		writeFile(path.join(rootDir, 'main.js'), 'main'),
		writeFile(path.join(rootDir, 'dist', 'main.js'), 'main'),
		writeFile(path.join(rootDir, 'styles.css'), 'styles'),
		writeFile(path.join(rootDir, 'dist', 'styles.css'), 'styles'),
	]);
	return rootDir;
}

test('pre-tag candidate accepts the unpublished 2.1.19 migration identity', async () => {
	const rootDir = await createCandidate();
	try {
		assert.deepEqual(await checkRelease(rootDir), {
			version: '2.1.19',
			buildNumber: 0,
			channel: 'formal',
		});
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('pre-tag candidate fails on version drift', async () => {
	const rootDir = await createCandidate();
	try {
		const manifest = JSON.parse(
			await (
				await import('node:fs/promises')
			).readFile(path.join(rootDir, 'dist', 'manifest.json'), 'utf8'),
		);
		await writeJson(path.join(rootDir, 'dist', 'manifest.json'), {
			...manifest,
			version: '2.1.18',
		});
		await assert.rejects(checkRelease(rootDir), /Version drift detected/);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('pre-tag candidate rejects missing or extra release files', async () => {
	const rootDir = await createCandidate();
	try {
		await writeFile(path.join(rootDir, 'dist', 'data.json'), 'user-data');
		await assert.rejects(checkRelease(rootDir), /must contain only/);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('package command topology separates daily, CI, candidate, and tag gates', async () => {
	const packageJson = JSON.parse(
		await (
			await import('node:fs/promises')
		).readFile(new URL('../package.json', import.meta.url), 'utf8'),
	);
	assert.equal(
		packageJson.scripts.check,
		'npm run format:check && npm run lint && npm run typecheck && npm test',
	);
	assert.match(packageJson.scripts.ci, /version:check/);
	assert.match(packageJson.scripts.ci, /build:production/);
	assert.equal(packageJson.scripts['release:check'], 'node scripts/release-check.mjs');
	assert.equal(packageJson.scripts['release:tag'], 'node scripts/release-tag.mjs');
	assert.equal(packageJson.scripts['release:test'], 'node scripts/release.mjs test');
	assert.equal(packageJson.scripts['release:formal'], 'node scripts/release.mjs formal');
	assert.match(packageJson.scripts['install:formal'], /install-plugin\.mjs --channel formal/);
	assert.doesNotMatch(packageJson.scripts['release:check'], /release:tag/);
});
