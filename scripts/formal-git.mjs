import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const DEFAULT_STANDARDS_ROOT = '/Users/crp/Projects/Codex 开发规范';

export function resolveCentralFormalGit(env = process.env) {
	const standardsRoot = env.AULYC_STANDARDS_ROOT?.trim() || DEFAULT_STANDARDS_ROOT;
	return path.resolve(standardsRoot, 'scripts', 'formal_release_git.py');
}

export const CENTRAL_FORMAL_GIT = resolveCentralFormalGit({});

export function runFormalGit({
	repoDir = process.cwd(),
	phase,
	tag,
	provenancePath,
	env = process.env,
	runner = spawnSync,
	fileExists = existsSync,
	skipExistenceCheck = false,
} = {}) {
	if (!['preflight', 'push', 'verify'].includes(phase)) {
		throw new Error('Formal GitHub phase must be preflight, push, or verify');
	}
	const centralFormalGit = resolveCentralFormalGit(env);
	if (!skipExistenceCheck && !fileExists(centralFormalGit)) {
		throw new Error(
			`Central formal GitHub gate not found: ${centralFormalGit}. ` +
				'Set AULYC_STANDARDS_ROOT to the Codex engineering standards repository root.',
		);
	}
	const args = [centralFormalGit, phase, '--path', path.resolve(repoDir)];
	if (tag) args.push('--tag', tag);
	if (provenancePath) args.push('--provenance', path.resolve(provenancePath));
	const result = runner('python3', args, {
		cwd: repoDir,
		encoding: 'utf8',
		stdio: 'inherit',
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`Central formal GitHub ${phase} failed`);
}

function parseArguments(argv) {
	const [phase, ...rest] = argv;
	const values = { phase };
	for (let index = 0; index < rest.length; index += 2) {
		const name = rest[index];
		const value = rest[index + 1];
		if (!['--tag', '--provenance'].includes(name) || !value) {
			throw new Error(
				'Usage: formal-git.mjs <preflight|push|verify> [--tag VERSION] [--provenance PATH]',
			);
		}
		values[name.slice(2)] = value;
	}
	return values;
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
	try {
		const args = parseArguments(process.argv.slice(2));
		runFormalGit({
			phase: args.phase,
			tag: args.tag,
			provenancePath: args.provenance,
		});
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
