import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildReleaseArtifact, verifyReleaseArtifact } from '../scripts/artifact.mjs';
import { sha256Buffer } from '../scripts/release-constants.mjs';
import { createZipBuffer, readZipEntries } from '../scripts/zip.mjs';
import { cleanupFixture, createReleaseFixture } from './helpers/release-fixture.mjs';

async function buildFixtureArtifact() {
	const fixture = await createReleaseFixture();
	const outputDir = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-artifact-'));
	const artifact = await buildReleaseArtifact({
		repoDir: fixture.rootDir,
		sourceDir: fixture.rootDir,
		outputDir,
		expectedChannel: 'test',
	});
	return { ...fixture, outputDir, ...artifact };
}

test('versioned ZIP and release provenance are derived from real Git and artifacts', async () => {
	const fixture = await buildFixtureArtifact();
	try {
		const result = await verifyReleaseArtifact({
			repoDir: fixture.rootDir,
			zipPath: fixture.zipPath,
			provenancePath: fixture.provenancePath,
			expectedChannel: 'test',
			sourceDir: fixture.rootDir,
		});
		assert.equal(result.provenance.releaseProfile, 'obsidian-plugin');
		assert.equal(result.provenance.distribution, 'local-vault');
		assert.equal(result.provenance.commit, fixture.releaseCommit);
		assert.equal(result.provenance.dirty, false);
		assert.deepEqual(
			result.entries.map((entry) => entry.name),
			['main.js', 'manifest.json', 'styles.css'],
		);
	} finally {
		await cleanupFixture(fixture.rootDir);
		await rm(fixture.outputDir, { recursive: true, force: true });
	}
});

test('provenance field and SHA-256 tampering fail closed', async () => {
	const fixture = await buildFixtureArtifact();
	try {
		const original = await readFile(fixture.provenancePath, 'utf8');
		const provenance = JSON.parse(original);
		provenance.releaseProfile = 'macos-arm64-app';
		await writeFile(fixture.provenancePath, `${JSON.stringify(provenance)}\n`);
		await assert.rejects(
			verifyReleaseArtifact({
				repoDir: fixture.rootDir,
				zipPath: fixture.zipPath,
				provenancePath: fixture.provenancePath,
				expectedChannel: 'test',
			}),
			/Release provenance mismatch: releaseProfile/,
		);
		provenance.releaseProfile = 'obsidian-plugin';
		provenance.artifact.sha256 = '0'.repeat(64);
		await writeFile(fixture.provenancePath, `${JSON.stringify(provenance)}\n`);
		await assert.rejects(
			verifyReleaseArtifact({
				repoDir: fixture.rootDir,
				zipPath: fixture.zipPath,
				provenancePath: fixture.provenancePath,
				expectedChannel: 'test',
			}),
			/Release ZIP SHA-256 mismatch/,
		);
	} finally {
		await cleanupFixture(fixture.rootDir);
		await rm(fixture.outputDir, { recursive: true, force: true });
	}
});

test('ZIP parser rejects duplicate, traversal, absolute, and symlink entries', () => {
	const required = [
		{ name: 'main.js', data: 'main' },
		{ name: 'manifest.json', data: '{}' },
		{ name: 'styles.css', data: 'styles' },
	];
	assert.throws(
		() => readZipEntries(createZipBuffer([...required, { name: 'main.js', data: 'duplicate' }])),
		/Duplicate ZIP entry/,
	);
	assert.throws(
		() => readZipEntries(createZipBuffer([...required, { name: '../data.json', data: 'secret' }])),
		/root-level file|Unsafe ZIP/,
	);
	assert.throws(
		() => readZipEntries(createZipBuffer([...required, { name: '/tmp/evil', data: 'evil' }])),
		/root-level file|Unsafe ZIP/,
	);
	assert.throws(
		() =>
			readZipEntries(
				createZipBuffer([...required, { name: 'link', data: 'main.js', mode: 0o120777 }]),
			),
		/Symbolic links are not allowed/,
	);
});

test('artifact verifier rejects missing and extra ZIP files even with matching outer SHA-256', async () => {
	const fixture = await buildFixtureArtifact();
	try {
		const provenance = JSON.parse(await readFile(fixture.provenancePath, 'utf8'));
		const validEntries = readZipEntries(await readFile(fixture.zipPath));
		for (const entries of [
			validEntries.slice(0, 2),
			[...validEntries, { name: 'data.json', data: Buffer.from('user-data') }],
		]) {
			const zip = createZipBuffer(entries);
			await writeFile(fixture.zipPath, zip);
			provenance.artifact.sha256 = sha256Buffer(zip);
			await writeFile(fixture.provenancePath, `${JSON.stringify(provenance)}\n`);
			await assert.rejects(
				verifyReleaseArtifact({
					repoDir: fixture.rootDir,
					zipPath: fixture.zipPath,
					provenancePath: fixture.provenancePath,
					expectedChannel: 'test',
				}),
				/ZIP must contain only/,
			);
		}
	} finally {
		await cleanupFixture(fixture.rootDir);
		await rm(fixture.outputDir, { recursive: true, force: true });
	}
});

test('dirty tagged source cannot be packaged', async () => {
	const fixture = await createReleaseFixture();
	const outputDir = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-artifact-dirty-'));
	try {
		await writeFile(path.join(fixture.rootDir, 'dirty.txt'), 'dirty');
		await assert.rejects(
			buildReleaseArtifact({
				repoDir: fixture.rootDir,
				sourceDir: fixture.rootDir,
				outputDir,
				expectedChannel: 'test',
			}),
			/isolated tagged source before packaging must be clean/,
		);
	} finally {
		await cleanupFixture(fixture.rootDir);
		await rm(outputDir, { recursive: true, force: true });
	}
});

test('an existing versioned artifact cannot be overwritten', async () => {
	const fixture = await buildFixtureArtifact();
	try {
		await assert.rejects(
			buildReleaseArtifact({
				repoDir: fixture.rootDir,
				sourceDir: fixture.rootDir,
				outputDir: fixture.outputDir,
				expectedChannel: 'test',
			}),
			/error|exist|EEXIST/i,
		);
	} finally {
		await cleanupFixture(fixture.rootDir);
		await rm(fixture.outputDir, { recursive: true, force: true });
	}
});
