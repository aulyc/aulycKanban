import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
	evaluateCoverageThresholds,
	formatCoverageFailures,
	mergeCoverageObjects,
} from '../scripts/coverage.mjs';

const location = (line) => ({
	start: { line, column: 0 },
	end: { line, column: 1 },
});

function createFileCoverage(filePath, firstHit, secondHit) {
	return {
		path: filePath,
		statementMap: {
			0: location(1),
			1: location(2),
		},
		fnMap: {
			0: {
				name: 'coveredFunction',
				decl: location(1),
				loc: location(1),
				line: 1,
			},
		},
		branchMap: {
			0: {
				type: 'if',
				line: 1,
				locations: [location(1), location(2)],
			},
		},
		s: { 0: firstHit, 1: secondHit },
		f: { 0: firstHit },
		b: { 0: [firstHit, secondHit] },
	};
}

test('coverage maps from direct and source-mapped passes merge without dropping missed lines', () => {
	const repositoryRoot = path.resolve('/tmp/coverage-runner-fixture');
	const filePath = path.join(repositoryRoot, 'src/example.ts');
	const coverageMap = mergeCoverageObjects([
		{ [filePath]: createFileCoverage(filePath, 1, 0) },
		{ [filePath]: createFileCoverage(filePath, 0, 1) },
	]);
	const summary = coverageMap.fileCoverageFor(filePath).toSummary();

	assert.equal(summary.statements.pct, 100);
	assert.equal(summary.branches.pct, 100);
	assert.equal(summary.functions.pct, 100);
	assert.equal(summary.lines.pct, 100);
});

test('coverage threshold evaluation reports global and per-file regressions', () => {
	const repositoryRoot = path.resolve('/tmp/coverage-runner-fixture');
	const relativePath = 'src/example.ts';
	const filePath = path.join(repositoryRoot, relativePath);
	const coverageMap = mergeCoverageObjects([{ [filePath]: createFileCoverage(filePath, 1, 0) }]);
	const thresholds = {
		global: {
			statements: 75,
			branches: 75,
			functions: 100,
			lines: 75,
		},
		files: {
			[relativePath]: {
				statements: 75,
				branches: 75,
				functions: 100,
				lines: 75,
			},
			'src/missing.ts': {
				statements: 1,
				branches: 1,
				functions: 1,
				lines: 1,
			},
		},
	};

	const failures = evaluateCoverageThresholds(coverageMap, thresholds, repositoryRoot);
	assert.deepEqual(
		failures.map(({ scope, metric }) => [scope, metric]),
		[
			['global', 'statements'],
			['global', 'branches'],
			['global', 'lines'],
			[relativePath, 'statements'],
			[relativePath, 'branches'],
			[relativePath, 'lines'],
			['src/missing.ts', 'file'],
		],
	);
	assert.match(formatCoverageFailures(failures), /global statements: 50% < 75%/);
	assert.match(formatCoverageFailures(failures), /src\/missing\.ts: missing/);
});
