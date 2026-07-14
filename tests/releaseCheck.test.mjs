import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkRelease } from '../scripts/release-check.mjs';

async function writeJson(filePath, value) {
	await writeFile(filePath, `${JSON.stringify(value, null, '\t')}\n`, 'utf8');
}

async function createReleaseFixture(version = '2.2.0-beta.1') {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-release-'));
	await mkdir(path.join(rootDir, 'dist'));
	const manifest = {
		id: 'aulyckanban',
		version,
		minAppVersion: '1.5.0',
	};
	await Promise.all([
		writeJson(path.join(rootDir, 'package.json'), { version }),
		writeJson(path.join(rootDir, 'package-lock.json'), {
			version,
			packages: { '': { version } },
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

test('release check accepts an aligned beta release', async () => {
	const rootDir = await createReleaseFixture();
	try {
		assert.deepEqual(await checkRelease(rootDir), {
			version: '2.2.0-beta.1',
			channel: 'beta',
		});
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('release check rejects version drift', async () => {
	const rootDir = await createReleaseFixture();
	try {
		await writeJson(path.join(rootDir, 'dist', 'manifest.json'), {
			id: 'aulyckanban',
			version: '2.1.2',
			minAppVersion: '1.5.0',
		});
		await assert.rejects(
			checkRelease(rootDir),
			/Version mismatch: dist\/manifest\.json=2\.1\.2, expected=2\.2\.0-beta\.1/,
		);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('release check rejects unsupported public prerelease channels', async () => {
	const rootDir = await createReleaseFixture('2.2.0-preview.1');
	try {
		await assert.rejects(
			checkRelease(rootDir),
			/Public releases must be stable or use alpha\.N, beta\.N, or rc\.N/,
		);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('release check rejects stale dist artifacts', async () => {
	const rootDir = await createReleaseFixture('2.2.0');
	try {
		await writeFile(path.join(rootDir, 'dist', 'styles.css'), 'stale styles');
		await assert.rejects(checkRelease(rootDir), /Stale dist artifact: dist\/styles\.css/);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('release verification builds ignored artifacts before installer tests run', async () => {
	const packageJson = JSON.parse(await readFile(
		new URL('../package.json', import.meta.url),
		'utf8',
	));
	assert.equal(
		packageJson.scripts['release:verify'],
		'npm run build && npm test && npm run release:check',
	);
});
