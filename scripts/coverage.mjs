import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import coverageLibrary from 'istanbul-lib-coverage';
import reportLibrary from 'istanbul-lib-report';
import reports from 'istanbul-reports';

const { createCoverageMap } = coverageLibrary;
const { createContext } = reportLibrary;
const METRICS = ['statements', 'branches', 'functions', 'lines'];
const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), '..');
const coverageDir = path.join(rootDir, 'coverage');
const sourceReportDir = path.join(coverageDir, '.source');
const bundleReportDir = path.join(coverageDir, '.bundled');
const bundleDir = path.join(rootDir, 'test-bundles');

export const COVERAGE_THRESHOLDS = {
	global: {
		statements: 82,
		branches: 76,
		functions: 83,
		lines: 82,
	},
	files: {
		'src/store.ts': { statements: 85, branches: 65, functions: 85, lines: 85 },
		'src/services/backupService.ts': {
			statements: 95,
			branches: 80,
			functions: 95,
			lines: 95,
		},
		'src/services/boardMigration.ts': {
			statements: 90,
			branches: 65,
			functions: 95,
			lines: 90,
		},
		'src/services/repository.ts': {
			statements: 75,
			branches: 55,
			functions: 80,
			lines: 75,
		},
		'src/services/syncService.ts': {
			statements: 85,
			branches: 70,
			functions: 75,
			lines: 85,
		},
		'src/ui/ClearDataModal.ts': {
			statements: 100,
			branches: 100,
			functions: 100,
			lines: 100,
		},
		'src/ui/ConfirmModal.ts': {
			statements: 100,
			branches: 100,
			functions: 100,
			lines: 100,
		},
		'src/ui/ArchiveView.ts': {
			statements: 80,
			branches: 80,
			functions: 85,
			lines: 80,
		},
		'src/ui/Board.ts': {
			statements: 90,
			branches: 95,
			functions: 70,
			lines: 90,
		},
		'src/ui/CategoryNav.ts': {
			statements: 50,
			branches: 80,
			functions: 30,
			lines: 50,
		},
		'src/ui/InlineInput.ts': {
			statements: 60,
			branches: 45,
			functions: 100,
			lines: 60,
		},
		'src/ui/KanbanSettingTab.ts': {
			statements: 80,
			branches: 80,
			functions: 70,
			lines: 80,
		},
		'src/ui/KanbanView.ts': {
			statements: 95,
			branches: 90,
			functions: 100,
			lines: 95,
		},
		'src/ui/TaskCard.ts': {
			statements: 75,
			branches: 60,
			functions: 75,
			lines: 75,
		},
		'src/ui/TaskControls.ts': {
			statements: 90,
			branches: 80,
			functions: 80,
			lines: 90,
		},
		'src/ui/TaskList.ts': {
			statements: 85,
			branches: 60,
			functions: 95,
			lines: 85,
		},
		'src/ui/Toolbar.ts': {
			statements: 50,
			branches: 70,
			functions: 30,
			lines: 50,
		},
		'src/ui/UtilityBar.ts': {
			statements: 90,
			branches: 80,
			functions: 90,
			lines: 90,
		},
		'src/utils/noteSync.ts': {
			statements: 100,
			branches: 75,
			functions: 100,
			lines: 100,
		},
	},
};

export function mergeCoverageObjects(coverageObjects) {
	const coverageMap = createCoverageMap({});
	for (const coverageObject of coverageObjects) coverageMap.merge(coverageObject);
	return coverageMap;
}

function evaluateSummary(scope, summary, thresholds) {
	return METRICS.flatMap((metric) => {
		const required = thresholds[metric];
		const actual = summary[metric].pct;
		return actual < required ? [{ scope, metric, actual, required }] : [];
	});
}

export function evaluateCoverageThresholds(coverageMap, thresholds, repositoryRoot) {
	const failures = evaluateSummary('global', coverageMap.getCoverageSummary(), thresholds.global);
	for (const [relativePath, fileThresholds] of Object.entries(thresholds.files)) {
		const absolutePath = path.resolve(repositoryRoot, relativePath);
		if (!coverageMap.files().includes(absolutePath)) {
			failures.push({ scope: relativePath, metric: 'file', actual: 0, required: 1 });
			continue;
		}
		failures.push(
			...evaluateSummary(
				relativePath,
				coverageMap.fileCoverageFor(absolutePath).toSummary(),
				fileThresholds,
			),
		);
	}
	return failures;
}

export function formatCoverageFailures(failures) {
	return failures
		.map(({ scope, metric, actual, required }) => {
			if (metric === 'file') return `- ${scope}: missing from merged coverage`;
			return `- ${scope} ${metric}: ${actual}% < ${required}%`;
		})
		.join('\n');
}

function executable(name) {
	const suffix = process.platform === 'win32' ? '.cmd' : '';
	return path.join(rootDir, 'node_modules', '.bin', `${name}${suffix}`);
}

function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: rootDir,
			stdio: 'inherit',
			shell: process.platform === 'win32',
		});
		child.once('error', reject);
		child.once('exit', (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					signal
						? `${path.basename(command)} terminated by ${signal}`
						: `${path.basename(command)} exited with code ${code}`,
				),
			);
		});
	});
}

async function readCoverage(reportDir) {
	return JSON.parse(await readFile(path.join(reportDir, 'coverage-final.json'), 'utf8'));
}

function writeMergedReports(coverageMap) {
	const context = createContext({ dir: coverageDir, coverageMap });
	for (const reporterName of ['text', 'json-summary', 'json']) {
		reports.create(reporterName).execute(context);
	}
}

async function collectCoverage() {
	const c8 = executable('c8');
	const tsx = executable('tsx');
	await run(c8, [
		'-o',
		sourceReportDir,
		'--all',
		'--src=src',
		'--extension=.ts',
		'--include=src/**/*.ts',
		'--exclude=src/types.ts',
		'--reporter=json',
		tsx,
		'--test',
		'tests/coverage/source-suite.test.mjs',
		'tests/coverage/core.test.ts',
	]);
	await run(c8, [
		'-o',
		bundleReportDir,
		'--include=test-bundles/*.cjs',
		'--reporter=json',
		tsx,
		'--test',
		'tests/coverage/bundle-suite.test.mjs',
	]);
	return mergeCoverageObjects([
		await readCoverage(sourceReportDir),
		await readCoverage(bundleReportDir),
	]);
}

async function main() {
	await rm(coverageDir, { recursive: true, force: true });
	await rm(bundleDir, { recursive: true, force: true });
	try {
		const coverageMap = await collectCoverage();
		writeMergedReports(coverageMap);
		const failures = evaluateCoverageThresholds(coverageMap, COVERAGE_THRESHOLDS, rootDir);
		if (failures.length > 0) {
			throw new Error(`Coverage thresholds failed:\n${formatCoverageFailures(failures)}`);
		}
		console.log('\nCoverage thresholds passed (merged direct-source and source-mapped tests).');
	} finally {
		await rm(sourceReportDir, { recursive: true, force: true });
		await rm(bundleReportDir, { recursive: true, force: true });
		await rm(bundleDir, { recursive: true, force: true });
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
