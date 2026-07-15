import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReleaseArtifact } from '../scripts/artifact.mjs';
import { discoverVaultPath, installReleaseArtifact } from '../scripts/install-plugin.mjs';
import { RELEASE_FILES, sha256Buffer } from '../scripts/release-constants.mjs';
import { cleanupFixture, createReleaseFixture } from './helpers/release-fixture.mjs';

async function createArtifactAndVault() {
	const fixture = await createReleaseFixture();
	const outputDir = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-install-artifact-'));
	const vaultPath = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-vault-'));
	await mkdir(path.join(vaultPath, '.obsidian'));
	const artifact = await buildReleaseArtifact({
		repoDir: fixture.rootDir,
		sourceDir: fixture.rootDir,
		outputDir,
		expectedChannel: 'test',
	});
	return { ...fixture, ...artifact, outputDir, vaultPath };
}

test('verified ZIP installer overwrites only three release files and preserves runtime data', async () => {
	const fixture = await createArtifactAndVault();
	const pluginDir = path.join(fixture.vaultPath, '.obsidian', 'plugins', 'aulyckanban');
	try {
		await mkdir(pluginDir, { recursive: true });
		await Promise.all([
			writeFile(path.join(pluginDir, 'data.json'), 'runtime-data'),
			writeFile(path.join(pluginDir, 'user-cache.json'), 'user-cache'),
			writeFile(path.join(pluginDir, 'main.js'), 'old-main'),
		]);
		const result = await installReleaseArtifact({
			repoDir: fixture.rootDir,
			zipPath: fixture.zipPath,
			provenancePath: fixture.provenancePath,
			expectedChannel: 'test',
			vaultPath: fixture.vaultPath,
		});
		assert.equal(result.manifest.version, fixture.version);
		assert.equal(await readFile(path.join(pluginDir, 'data.json'), 'utf8'), 'runtime-data');
		assert.equal(await readFile(path.join(pluginDir, 'user-cache.json'), 'utf8'), 'user-cache');
		assert.deepEqual(
			(await readdir(pluginDir)).sort(),
			[...RELEASE_FILES, 'data.json', 'user-cache.json'].sort(),
		);
		for (const expected of fixture.provenance.files) {
			assert.equal(
				sha256Buffer(await readFile(path.join(pluginDir, expected.file))),
				expected.sha256,
			);
		}
	} finally {
		await cleanupFixture(fixture.rootDir);
		await rm(fixture.outputDir, { recursive: true, force: true });
		await rm(fixture.vaultPath, { recursive: true, force: true });
	}
});

test('installer rejects current workspace dist and has no silent fallback', async () => {
	const fixture = await createArtifactAndVault();
	try {
		await assert.rejects(
			installReleaseArtifact({
				repoDir: fixture.rootDir,
				zipPath: path.join(fixture.rootDir, 'dist'),
				provenancePath: fixture.provenancePath,
				expectedChannel: 'test',
				vaultPath: fixture.vaultPath,
			}),
			/Release artifact must be a ZIP file/,
		);
		await assert.rejects(
			installReleaseArtifact({ vaultPath: fixture.vaultPath }),
			/requires explicit --zip and --provenance inputs/,
		);
	} finally {
		await cleanupFixture(fixture.rootDir);
		await rm(fixture.outputDir, { recursive: true, force: true });
		await rm(fixture.vaultPath, { recursive: true, force: true });
	}
});

test('Vault target is discovered through a mocked Obsidian CLI when no path is configured', async () => {
	const vaultPath = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-discovered-vault-'));
	try {
		const calls = [];
		const runner = (command, args) => {
			calls.push([command, ...args]);
			return { status: 0, stdout: `${vaultPath}\n`, stderr: '' };
		};
		assert.equal(discoverVaultPath({ env: {}, runner }), vaultPath);
		assert.deepEqual(calls, [['obsidian', 'eval', 'code=app.vault.adapter.basePath']]);
	} finally {
		await rm(vaultPath, { recursive: true, force: true });
	}
});
