import assert from 'node:assert/strict';
import test from 'node:test';
import selectionModule from '../src/ui/TaskSelection.ts';

const { TaskSelection } = selectionModule;

const keys = ['work:base:a', 'work:base:b', 'personal:base:c', 'personal:important:d'];

test('modifier selection toggles independent task coordinates and enters selection mode', () => {
	const selection = new TaskSelection();
	selection.toggle(keys[0]);
	selection.toggle(keys[2]);

	assert.equal(selection.isActive, true);
	assert.deepEqual(selection.keys, [keys[0], keys[2]]);
	selection.toggle(keys[0]);
	assert.deepEqual(selection.keys, [keys[2]]);
});

test('range selection follows the current visible order from the retained anchor', () => {
	const selection = new TaskSelection();
	selection.toggle(keys[1]);
	selection.selectRange(keys[3], keys);

	assert.deepEqual(selection.keys, [keys[1], keys[2], keys[3]]);
});

test('select all toggles only visible cards and scope changes clear hidden selection', () => {
	const selection = new TaskSelection();
	selection.selectAll(keys.slice(0, 3));
	assert.deepEqual(selection.keys, keys.slice(0, 3));

	selection.selectAll(keys.slice(0, 3));
	assert.deepEqual(selection.keys, []);

	selection.toggle(keys[3]);
	selection.resetForScope('work|base');
	selection.resetForScope('personal|base');
	assert.equal(selection.isActive, false);
	assert.deepEqual(selection.keys, []);
});

test('pruning removes tasks that no longer exist without changing surviving order', () => {
	const selection = new TaskSelection();
	selection.selectAll(keys);
	selection.prune(new Set([keys[0], keys[2]]));

	assert.deepEqual(selection.keys, [keys[0], keys[2]]);
});
