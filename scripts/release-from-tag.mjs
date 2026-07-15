import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildReleaseArtifact } from './artifact.mjs';
import { assertCleanGit, runGit, verifyAnnotatedTag } from './git-release.mjs';

function run(command, args, cwd) {
	const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0)
		throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
}

export async function buildFromExactTag({ repoDir, tag, outputDir, expectedChannel } = {}) {
	const tagInfo = verifyAnnotatedTag({ repoDir, tag, expectedVersion: tag });
	const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-release-worktree-'));
	const worktreeDir = path.join(temporaryRoot, 'source');
	let worktreeAdded = false;
	try {
		runGit(repoDir, ['worktree', 'add', '--detach', worktreeDir, tagInfo.commit]);
		worktreeAdded = true;
		assertCleanGit(worktreeDir, 'isolated tagged source before build');
		const head = runGit(worktreeDir, ['rev-parse', 'HEAD']).stdout.trim();
		if (head !== tagInfo.commit) throw new Error('Detached worktree commit mismatch');
		run('npm', ['ci', '--ignore-scripts'], worktreeDir);
		run('npm', ['run', 'version:check'], worktreeDir);
		run('npm', ['run', 'build:production'], worktreeDir);
		run('npm', ['run', 'artifact:verify'], worktreeDir);
		assertCleanGit(worktreeDir, 'isolated tagged source after build');
		return await buildReleaseArtifact({
			repoDir,
			sourceDir: worktreeDir,
			outputDir,
			expectedChannel,
		});
	} finally {
		if (worktreeAdded) {
			runGit(repoDir, ['worktree', 'remove', '--force', worktreeDir], { allowFailure: true });
			runGit(repoDir, ['worktree', 'prune'], { allowFailure: true });
		}
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}
