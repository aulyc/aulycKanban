import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { checkVersionFiles, getReleaseChannel } from '../version-bump.mjs';
import { verifyDistArtifacts } from './artifact.mjs';
import { assertCleanGit } from './git-release.mjs';

export async function checkRelease(rootDir = process.cwd()) {
	const releaseVersion = await checkVersionFiles(rootDir);
	const releaseChannel = getReleaseChannel(releaseVersion.version);
	if (!releaseChannel) throw new Error(`Unsupported release version: ${releaseVersion.version}`);
	const { manifest } = await verifyDistArtifacts({ rootDir });
	if (manifest.version !== releaseVersion.version) throw new Error('Candidate manifest version drift');
	return {
		version: releaseVersion.version,
		buildNumber: releaseVersion.buildNumber,
		channel: releaseChannel.channel,
	};
}

function runCi(rootDir) {
	const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	const result = spawnSync(command, ['run', 'ci'], { cwd: rootDir, encoding: 'utf8', stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`CI-equivalent gate failed with exit ${result.status}`);
}

async function main() {
	const rootDir = process.cwd();
	assertCleanGit(rootDir, 'calling worktree before release check');
	runCi(rootDir);
	const result = await checkRelease(rootDir);
	assertCleanGit(rootDir, 'calling worktree after release check');
	const migration = result.buildNumber === 0 ? ' (unpublished migration state)' : '';
	console.log(
		`[release] Candidate verified ${result.version} build ${result.buildNumber} ${result.channel}${migration}`,
	);
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
	try {
		await main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
