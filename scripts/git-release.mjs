import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getReleaseChannel } from '../version-bump.mjs';

export function runGit(repoDir, args, { allowFailure = false } = {}) {
	const result = spawnSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' });
	if (result.error) throw result.error;
	if (result.status !== 0 && !allowFailure) {
		throw new Error((result.stderr || result.stdout || `git ${args[0]} failed`).trim());
	}
	return result;
}

export function getGitStatus(repoDir) {
	return runGit(repoDir, ['status', '--porcelain=v1', '--untracked-files=all']).stdout.trim();
}

export function assertCleanGit(repoDir, label = 'release source') {
	const status = getGitStatus(repoDir);
	if (status) throw new Error(`${label} must be clean:\n${status}`);
}

export function readJsonAtCommit(repoDir, commit, fileName) {
	const result = runGit(repoDir, ['show', `${commit}:${fileName}`], { allowFailure: true });
	if (result.status !== 0) return null;
	return JSON.parse(result.stdout);
}

export function verifyAnnotatedTag({ repoDir, tag, expectedVersion = tag, expectedCommit } = {}) {
	if (!getReleaseChannel(expectedVersion) || tag !== expectedVersion) {
		throw new Error(`Tag name must exactly match release version: ${tag} != ${expectedVersion}`);
	}
	const reference = `refs/tags/${tag}`;
	const type = runGit(repoDir, ['cat-file', '-t', reference], { allowFailure: true });
	if (type.status !== 0) throw new Error(`Release tag does not exist: ${tag}`);
	if (type.stdout.trim() !== 'tag') throw new Error(`Release tag must be annotated: ${tag}`);
	const commit = runGit(repoDir, ['rev-parse', `${reference}^{commit}`]).stdout.trim();
	if (expectedCommit && commit !== expectedCommit) {
		throw new Error(`Tag commit mismatch: ${tag}=${commit}, expected=${expectedCommit}`);
	}
	const releaseVersion = readJsonAtCommit(repoDir, commit, 'release-version.json');
	if (!releaseVersion || releaseVersion.version !== expectedVersion) {
		throw new Error(`Tag version mismatch at ${tag}: release-version.json is not ${expectedVersion}`);
	}
	if (!Number.isInteger(releaseVersion.buildNumber) || releaseVersion.buildNumber <= 0) {
		throw new Error(`Tagged releases require a positive integer buildNumber: ${tag}`);
	}
	return { tag, type: 'annotated', commit, releaseVersion };
}

export function validateBuildNumberHistory({ repoDir, version, buildNumber, currentTag = null } = {}) {
	if (!Number.isInteger(buildNumber) || buildNumber <= 0) {
		throw new Error('A future test or formal release requires a positive integer buildNumber');
	}
	const tags = runGit(repoDir, ['tag', '--list']).stdout.split(/\r?\n/u).filter(Boolean);
	let maximum = 0;
	for (const tag of tags) {
		const commitResult = runGit(repoDir, ['rev-parse', `${tag}^{commit}`], { allowFailure: true });
		if (commitResult.status !== 0) continue;
		const tagged = readJsonAtCommit(repoDir, commitResult.stdout.trim(), 'release-version.json');
		if (!tagged || !Number.isInteger(tagged.buildNumber) || tagged.buildNumber <= 0) continue;
		if (tag === currentTag && tagged.version === version && tagged.buildNumber === buildNumber) continue;
		if (tagged.buildNumber === buildNumber) {
			throw new Error(`buildNumber ${buildNumber} was already used by tag ${tag}`);
		}
		maximum = Math.max(maximum, tagged.buildNumber);
	}
	if (buildNumber <= maximum) {
		throw new Error(`buildNumber must increase beyond ${maximum}: ${buildNumber}`);
	}
	return { maximumPreviousBuildNumber: maximum };
}

export async function verifyReleaseMetadataCommit(repoDir, version) {
	const commit = runGit(repoDir, ['rev-parse', 'HEAD']).stdout.trim();
	const subject = runGit(repoDir, ['log', '-1', '--format=%s']).stdout.trim();
	if (subject !== `chore: release ${version}`) {
		throw new Error(`Release commit subject must be: chore: release ${version}`);
	}
	const changed = runGit(repoDir, [
		'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD',
	]).stdout.split(/\r?\n/u).filter(Boolean);
	const allowed = new Set([
		'CHANGELOG.md',
		'dist/manifest.json',
		'manifest.json',
		'package-lock.json',
		'package.json',
		'release-version.json',
		'versions.json',
	]);
	const forbidden = changed.filter((fileName) => !allowed.has(fileName));
	if (forbidden.length > 0) {
		throw new Error(`Release metadata commit contains non-release files: ${forbidden.join(', ')}`);
	}
	if (!changed.includes('release-version.json') || !changed.includes('CHANGELOG.md')) {
		throw new Error('Release metadata commit must update release-version.json and CHANGELOG.md');
	}
	const changelog = await readFile(path.join(repoDir, 'CHANGELOG.md'), 'utf8');
	const escaped = version.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
	if (!new RegExp(`^## \\[?${escaped}\\]? - \\d{4}-\\d{2}-\\d{2}$`, 'mu').test(changelog)) {
		throw new Error(`CHANGELOG.md must contain an exact dated heading for ${version}`);
	}
	return { commit, changed };
}
