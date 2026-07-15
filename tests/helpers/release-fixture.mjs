import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function git(repoDir, args, { allowFailure = false } = {}) {
	const result = spawnSync('git', ['-C', repoDir, ...args], { encoding: 'utf8' });
	if (result.error) throw result.error;
	if (result.status !== 0 && !allowFailure) {
		throw new Error((result.stderr || result.stdout).trim());
	}
	return result;
}

export async function writeJson(filePath, value) {
	await writeFile(filePath, `${JSON.stringify(value, null, '\t')}\n`, 'utf8');
}

async function writeProductFiles(rootDir, version) {
	const manifest = {
		id: 'aulyckanban',
		name: 'aulyckanban',
		version,
		minAppVersion: '1.5.0',
		isDesktopOnly: false,
	};
	await Promise.all([
		writeJson(path.join(rootDir, 'manifest.json'), manifest),
		writeJson(path.join(rootDir, 'dist', 'manifest.json'), manifest),
		writeFile(path.join(rootDir, 'main.js'), 'fixture-main'),
		writeFile(path.join(rootDir, 'dist', 'main.js'), 'fixture-main'),
		writeFile(path.join(rootDir, 'styles.css'), 'fixture-styles'),
		writeFile(path.join(rootDir, 'dist', 'styles.css'), 'fixture-styles'),
	]);
}

export async function createReleaseFixture({
	version = '2.1.20-beta.1',
	buildNumber = 1,
	tag = 'annotated',
	dirtyBuild = false,
} = {}) {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aulyckanban-release-fixture-'));
	await mkdir(path.join(rootDir, 'dist'));
	const packageJson = {
		name: 'aulyckanban',
		version: '2.1.19',
		scripts: {
			'version:check': 'node -e ""',
			'build:production': dirtyBuild
				? 'node -e "require(\'fs\').writeFileSync(\'dirty.txt\', \'dirty\')"'
				: 'node -e ""',
			'artifact:verify': 'node -e ""',
		},
	};
	const lock = {
		name: 'aulyckanban',
		version: '2.1.19',
		lockfileVersion: 3,
		requires: true,
		packages: { '': { name: 'aulyckanban', version: '2.1.19' } },
	};
	await Promise.all([
		writeJson(path.join(rootDir, 'release-version.json'), {
			version: '2.1.19', buildNumber: 0,
		}),
		writeJson(path.join(rootDir, 'package.json'), packageJson),
		writeJson(path.join(rootDir, 'package-lock.json'), lock),
		writeJson(path.join(rootDir, 'versions.json'), { '2.1.19': '1.5.0' }),
		writeFile(path.join(rootDir, 'CHANGELOG.md'), '# Changelog\n\n## Unreleased\n'),
		writeFile(path.join(rootDir, '.gitignore'), 'node_modules/\n'),
	]);
	await writeProductFiles(rootDir, '2.1.19');
	git(rootDir, ['init', '-q']);
	git(rootDir, ['config', 'user.name', 'Fixture']);
	git(rootDir, ['config', 'user.email', 'fixture@example.invalid']);
	git(rootDir, ['add', '.']);
	git(rootDir, ['commit', '-q', '-m', 'feat: fixture product']);
	const initialCommit = git(rootDir, ['rev-parse', 'HEAD']).stdout.trim();
	git(rootDir, ['tag', '2.1.19']);

	packageJson.version = version;
	lock.version = version;
	lock.packages[''].version = version;
	await Promise.all([
		writeJson(path.join(rootDir, 'release-version.json'), { version, buildNumber }),
		writeJson(path.join(rootDir, 'package.json'), packageJson),
		writeJson(path.join(rootDir, 'package-lock.json'), lock),
		writeJson(path.join(rootDir, 'versions.json'), {
			'2.1.19': '1.5.0', [version]: '1.5.0',
		}),
		writeFile(
			path.join(rootDir, 'CHANGELOG.md'),
			`# Changelog\n\n## [${version}] - 2026-07-15\n\n- Fixture release.\n`,
		),
	]);
	await writeProductFiles(rootDir, version);
	git(rootDir, ['add', '.']);
	git(rootDir, ['commit', '-q', '-m', `chore: release ${version}`]);
	const releaseCommit = git(rootDir, ['rev-parse', 'HEAD']).stdout.trim();
	if (tag === 'annotated') git(rootDir, ['tag', '-a', version, '-m', `Release ${version}`]);
	if (tag === 'lightweight') git(rootDir, ['tag', version]);
	return { rootDir, version, buildNumber, initialCommit, releaseCommit };
}

export async function readJsonFile(filePath) {
	return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function cleanupFixture(rootDir) {
	await rm(rootDir, { recursive: true, force: true });
}
