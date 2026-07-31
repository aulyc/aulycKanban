import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { getReleaseChannel, readReleaseVersion } from '../version-bump.mjs';
import { assertCleanGit } from './git-release.mjs';
import { installReleaseArtifact } from './install-plugin.mjs';
import { runInstalledObsidianSmoke } from './obsidian-smoke.mjs';
import { buildFromExactTag } from './release-from-tag.mjs';
import { runFormalGit } from './formal-git.mjs';

function parseArguments(argv) {
	const [operation, ...rest] = argv;
	if (!['test', 'formal', 'test-install', 'formal-install'].includes(operation))
		throw new Error('Release operation must be test, formal, test-install, or formal-install');
	const install = operation.endsWith('-install');
	const channel = operation.replace(/-install$/u, '');
	const values = { channel, install };
	const allowed = new Set(['output-dir', 'vault']);
	for (let index = 0; index < rest.length; index += 1) {
		const argument = rest[index];
		if (!argument.startsWith('--')) throw new Error(`Unknown release argument: ${argument}`);
		const key = argument.slice(2);
		if (!allowed.has(key)) throw new Error(`Unknown release option: --${key}`);
		const value = rest[index + 1];
		if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
		values[key] = value;
		index += 1;
	}
	return values;
}

export async function runRelease({
	repoDir = process.cwd(),
	channel,
	outputDir = path.join(repoDir, 'release-artifacts'),
	vaultPath,
	env = process.env,
	runner,
	install = false,
} = {}) {
	if (!install && vaultPath) {
		throw new Error('Pure release does not accept --vault; use test-install or formal-install');
	}
	assertCleanGit(repoDir, 'calling worktree before release');
	const releaseVersion = await readReleaseVersion(repoDir);
	const actualChannel = getReleaseChannel(releaseVersion.version)?.channel;
	if (actualChannel !== channel) {
		throw new Error(`Release channel mismatch: ${String(actualChannel)} != ${String(channel)}`);
	}
	if (releaseVersion.buildNumber <= 0) {
		throw new Error('Test and formal releases require a positive buildNumber');
	}
	if (channel === 'formal') {
		runFormalGit({ repoDir, phase: 'preflight' });
	}
	const artifact = await buildFromExactTag({
		repoDir,
		tag: releaseVersion.version,
		outputDir: path.resolve(outputDir),
		expectedChannel: channel,
	});
	if (channel === 'formal') {
		runFormalGit({
			repoDir,
			phase: 'push',
			tag: releaseVersion.version,
			provenancePath: artifact.provenancePath,
		});
		runFormalGit({
			repoDir,
			phase: 'verify',
			tag: releaseVersion.version,
			provenancePath: artifact.provenancePath,
		});
	}
	let installed = null;
	if (install) {
		installed = await installReleaseArtifact({
			repoDir,
			zipPath: artifact.zipPath,
			provenancePath: artifact.provenancePath,
			expectedChannel: channel,
			vaultPath,
			env,
			runner,
		});
		runInstalledObsidianSmoke({
			manifestPath: installed.manifestPath,
			runner,
			cli: env.OBSIDIAN_CLI?.trim() || 'obsidian',
			vaultName: env.OBSIDIAN_VAULT_NAME?.trim() || '',
		});
	}
	assertCleanGit(repoDir, 'calling worktree after release');
	return { artifact, installed };
}

async function main() {
	const args = parseArguments(process.argv.slice(2));
	const result = await runRelease({
		channel: args.channel,
		outputDir: args['output-dir'],
		vaultPath: args.vault,
		install: args.install,
	});
	console.log(
		`[release] releaseStatus=complete installationStatus=${result.installed ? 'complete' : 'not-requested'}`,
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
