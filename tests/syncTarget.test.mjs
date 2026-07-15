import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

async function loadBundle(entryPoint) {
	const bundle = await build({
		entryPoints: [new URL(entryPoint, import.meta.url).pathname],
		bundle: true,
		format: 'cjs',
		platform: 'node',
		write: false,
		logLevel: 'silent',
	});
	const module = { exports: {} };
	vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports });
	return module.exports;
}

const { getMutationSyncTarget } = await loadBundle('../src/utils/syncTarget.ts');

test('cross-task-type card mutations sync their explicit source task type', () => {
	assert.equal(
		JSON.stringify(getMutationSyncTarget('EDIT_TASK', 'personal', 'work')),
		JSON.stringify({ kind: 'view', viewId: 'work' }),
	);
	assert.equal(
		JSON.stringify(getMutationSyncTarget('RESTORE_TASK', 'personal', 'work')),
		JSON.stringify({ kind: 'view', viewId: 'work' }),
	);
});

test('ordinary and board-wide mutations retain their current sync scope', () => {
	assert.equal(
		JSON.stringify(getMutationSyncTarget('ADD_TASK', 'personal', null)),
		JSON.stringify({ kind: 'view', viewId: 'personal' }),
	);
	assert.equal(
		JSON.stringify(getMutationSyncTarget('ADD_COLUMN', 'personal', null)),
		JSON.stringify({ kind: 'all' }),
	);
});
