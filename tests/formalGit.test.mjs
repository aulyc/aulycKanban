import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { CENTRAL_FORMAL_GIT, runFormalGit } from '../scripts/formal-git.mjs';

test('formal GitHub wrapper delegates only to the central controlled gate', () => {
	let invocation;
	runFormalGit({
		repoDir: '/tmp/project with spaces',
		phase: 'push',
		tag: '1.2.3',
		provenancePath: '/tmp/release provenance.json',
		runner(command, args, options) {
			invocation = { command, args, options };
			return { status: 0 };
		},
	});
	assert.equal(invocation.command, 'python3');
	assert.deepEqual(invocation.args, [
		CENTRAL_FORMAL_GIT,
		'push',
		'--path',
		path.resolve('/tmp/project with spaces'),
		'--tag',
		'1.2.3',
		'--provenance',
		path.resolve('/tmp/release provenance.json'),
	]);
	assert.equal(invocation.options.cwd, '/tmp/project with spaces');
});

test('formal GitHub wrapper fails closed when the central gate fails', () => {
	assert.throws(
		() =>
			runFormalGit({
				phase: 'preflight',
				runner: () => ({ status: 2 }),
			}),
		/Central formal GitHub preflight failed/,
	);
});
