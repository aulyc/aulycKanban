import assert from 'node:assert/strict';
import test from 'node:test';
import syncTargetModule from '../src/utils/syncTarget.ts';

const { getMutationSyncTarget } = syncTargetModule;

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
