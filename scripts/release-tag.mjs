import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { readReleaseVersion } from '../version-bump.mjs';
import {
	assertCleanGit,
	runGit,
	validateBuildNumberHistory,
	verifyAnnotatedTag,
	verifyReleaseMetadataCommit,
} from './git-release.mjs';

export async function createOrVerifyReleaseTag({ repoDir, runCandidateGate = true } = {}) {
	assertCleanGit(repoDir, 'calling worktree before release tag');
	const { version, buildNumber } = await readReleaseVersion(repoDir);
	const metadata = await verifyReleaseMetadataCommit(repoDir, version);
	const existing = runGit(repoDir, ['show-ref', '--verify', `refs/tags/${version}`], { allowFailure: true });
	if (existing.status === 0) {
		validateBuildNumberHistory({ repoDir, version, buildNumber, currentTag: version });
		return { ...verifyAnnotatedTag({
			repoDir,
			tag: version,
			expectedVersion: version,
			expectedCommit: metadata.commit,
		}), created: false };
	}
	validateBuildNumberHistory({ repoDir, version, buildNumber });
	if (runCandidateGate) {
		const result = spawnSync('npm', ['run', 'release:check'], {
			cwd: repoDir,
			encoding: 'utf8',
			stdio: 'inherit',
		});
		if (result.error) throw result.error;
		if (result.status !== 0) throw new Error('Pre-tag candidate gate failed');
	}
	assertCleanGit(repoDir, 'calling worktree before tag creation');
	const result = runGit(repoDir, ['tag', '-a', version, '-m', `Release ${version}`, metadata.commit]);
	if (result.status !== 0) throw new Error(`Failed to create release tag ${version}`);
	return { ...verifyAnnotatedTag({
		repoDir,
		tag: version,
		expectedVersion: version,
		expectedCommit: metadata.commit,
	}), created: true };
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
	try {
		const result = await createOrVerifyReleaseTag({ repoDir: process.cwd() });
		console.log(`[release] ${result.created ? 'Created' : 'Verified'} annotated tag ${result.tag}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
