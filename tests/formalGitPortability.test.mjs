import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { resolveCentralFormalGit, runFormalGit } from '../scripts/formal-git.mjs';

test('formal GitHub wrapper resolves the central gate from a configurable standards root', () => {
	assert.equal(
		resolveCentralFormalGit({ AULYC_STANDARDS_ROOT: '/opt/aulyc standards' }),
		path.resolve('/opt/aulyc standards/scripts/formal_release_git.py'),
	);

	let delegatedPath;
	runFormalGit({
		phase: 'preflight',
		env: { AULYC_STANDARDS_ROOT: '/opt/aulyc standards' },
		fileExists: () => true,
		runner(_command, args) {
			[delegatedPath] = args;
			return { status: 0 };
		},
	});
	assert.equal(delegatedPath, path.resolve('/opt/aulyc standards/scripts/formal_release_git.py'));
});

test('formal GitHub wrapper fails closed with an actionable error when the central gate is missing', () => {
	assert.throws(
		() =>
			runFormalGit({
				phase: 'preflight',
				env: { AULYC_STANDARDS_ROOT: '/missing/standards' },
				fileExists: () => false,
			}),
		/AULYC_STANDARDS_ROOT/,
	);
});

test('formal GitHub wrapper checks the central gate before invoking a custom runner', () => {
	let invoked = false;
	assert.throws(
		() =>
			runFormalGit({
				phase: 'preflight',
				env: { AULYC_STANDARDS_ROOT: '/definitely-missing/aulyc-standards' },
				runner() {
					invoked = true;
					return { status: 0 };
				},
			}),
		/AULYC_STANDARDS_ROOT/,
	);
	assert.equal(invoked, false);
});

test('formal GitHub wrapper skips the existence check only when explicitly requested', () => {
	let existenceChecked = false;
	let invoked = false;
	runFormalGit({
		phase: 'preflight',
		env: { AULYC_STANDARDS_ROOT: '/missing/standards' },
		skipExistenceCheck: true,
		fileExists() {
			existenceChecked = true;
			return false;
		},
		runner() {
			invoked = true;
			return { status: 0 };
		},
	});
	assert.equal(existenceChecked, false);
	assert.equal(invoked, true);
});
