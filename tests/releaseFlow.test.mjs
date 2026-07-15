import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildFromExactTag } from '../scripts/release-from-tag.mjs';
import {
	validateBuildNumberHistory,
	verifyAnnotatedTag,
} from '../scripts/git-release.mjs';
import { createOrVerifyReleaseTag } from '../scripts/release-tag.mjs';
import {
	cleanupFixture,
	createReleaseFixture,
	git,
} from './helpers/release-fixture.mjs';

test('historical lightweight tags remain while new release tags must be annotated', async () => {
	const fixture = await createReleaseFixture();
	try {
		assert.equal(git(fixture.rootDir, ['cat-file', '-t', 'refs/tags/2.1.19']).stdout.trim(), 'commit');
		assert.deepEqual(
			verifyAnnotatedTag({
				repoDir: fixture.rootDir,
				tag: fixture.version,
				expectedVersion: fixture.version,
				expectedCommit: fixture.releaseCommit,
			}),
			{
				tag: fixture.version,
				type: 'annotated',
				commit: fixture.releaseCommit,
				releaseVersion: { version: fixture.version, buildNumber: 1 },
			},
		);
	} finally {
		await cleanupFixture(fixture.rootDir);
	}
});

test('tag type, name, version, and commit mismatches are rejected', async () => {
	const fixture = await createReleaseFixture({ tag: 'lightweight' });
	try {
		assert.throws(
			() => verifyAnnotatedTag({ repoDir: fixture.rootDir, tag: fixture.version }),
			/must be annotated/,
		);
		assert.throws(
			() => verifyAnnotatedTag({
				repoDir: fixture.rootDir,
				tag: fixture.version,
				expectedVersion: '2.1.20-beta.2',
			}),
			/Tag name must exactly match release version/,
		);
	} finally {
		await cleanupFixture(fixture.rootDir);
	}
});

test('annotated tag pointing at the wrong commit is rejected', async () => {
	const fixture = await createReleaseFixture();
	try {
		assert.throws(
			() => verifyAnnotatedTag({
				repoDir: fixture.rootDir,
				tag: fixture.version,
				expectedVersion: fixture.version,
				expectedCommit: fixture.initialCommit,
			}),
			/Tag commit mismatch/,
		);
	} finally {
		await cleanupFixture(fixture.rootDir);
	}
});

test('build number history rejects reuse and rollback but ignores legacy build zero', async () => {
	const fixture = await createReleaseFixture();
	try {
		assert.throws(
			() => validateBuildNumberHistory({
				repoDir: fixture.rootDir, version: '2.1.20-beta.2', buildNumber: 1,
			}),
			/already used/,
		);
		assert.deepEqual(
			validateBuildNumberHistory({
				repoDir: fixture.rootDir, version: '2.1.20-beta.2', buildNumber: 2,
			}),
			{ maximumPreviousBuildNumber: 1 },
		);
	} finally {
		await cleanupFixture(fixture.rootDir);
	}
});

test('release tag command creates and then only verifies an annotated fixture tag', async () => {
	const fixture = await createReleaseFixture({ tag: 'none' });
	try {
		const created = await createOrVerifyReleaseTag({
			repoDir: fixture.rootDir,
			runCandidateGate: false,
		});
		assert.equal(created.created, true);
		assert.equal(created.type, 'annotated');
		const verified = await createOrVerifyReleaseTag({
			repoDir: fixture.rootDir,
			runCandidateGate: false,
		});
		assert.equal(verified.created, false);
		assert.equal(verified.commit, fixture.releaseCommit);
	} finally {
		await cleanupFixture(fixture.rootDir);
	}
});

test('final artifact builds from an exact detached tag and cleans the temporary worktree', async () => {
	const fixture = await createReleaseFixture();
	const outputDir = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-tag-build-'));
	try {
		const result = await buildFromExactTag({
			repoDir: fixture.rootDir,
			tag: fixture.version,
			outputDir,
			expectedChannel: 'test',
		});
		assert.match(result.zipPath, /aulyckanban-2\.1\.20-beta\.1\.zip$/u);
		const worktrees = git(fixture.rootDir, ['worktree', 'list', '--porcelain']).stdout;
		assert.equal((worktrees.match(/^worktree /gmu) ?? []).length, 1);
	} finally {
		await cleanupFixture(fixture.rootDir);
		await rm(outputDir, { recursive: true, force: true });
	}
});

test('detached build fails if its production command dirties tagged source and still cleans up', async () => {
	const fixture = await createReleaseFixture({ dirtyBuild: true });
	const outputDir = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-tag-dirty-'));
	try {
		await assert.rejects(
			buildFromExactTag({
				repoDir: fixture.rootDir,
				tag: fixture.version,
				outputDir,
				expectedChannel: 'test',
			}),
			/isolated tagged source after build must be clean/,
		);
		const worktrees = git(fixture.rootDir, ['worktree', 'list', '--porcelain']).stdout;
		assert.equal((worktrees.match(/^worktree /gmu) ?? []).length, 1);
	} finally {
		await cleanupFixture(fixture.rootDir);
		await rm(outputDir, { recursive: true, force: true });
	}
});
