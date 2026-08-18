import assert from 'node:assert/strict';
import test from 'node:test';
import reorderModule from '../src/utils/reorder.ts';

const { getReorderSide, getStableReorderSide, reorderIds, reorderIdsIfChanged } = reorderModule;

test('drop side follows the pointer half of the target item', () => {
	assert.equal(getReorderSide(24, 10, 30), 'before');
	assert.equal(getReorderSide(25, 10, 30), 'after');
});

test('stable drop side absorbs midpoint jitter but allows an intentional return', () => {
	assert.equal(getStableReorderSide(18, 0, 40, null), 'before');
	assert.equal(getStableReorderSide(18, 0, 40, 'after'), 'after');
	assert.equal(getStableReorderSide(5, 0, 40, 'after'), 'before');
	assert.equal(getStableReorderSide(22, 0, 40, 'before'), 'before');
	assert.equal(getStableReorderSide(35, 0, 40, 'before'), 'after');
});

test('an item can move before or after another item without losing ids', () => {
	assert.deepEqual(reorderIds(['a', 'b', 'c'], 'c', 'a', 'before'), ['c', 'a', 'b']);
	assert.deepEqual(reorderIds(['a', 'b', 'c'], 'a', 'b', 'after'), ['b', 'a', 'c']);
});

test('self and unknown reorder targets preserve the original order', () => {
	assert.deepEqual(reorderIds(['a', 'b'], 'a', 'a', 'before'), ['a', 'b']);
	assert.deepEqual(reorderIds(['a', 'b'], 'missing', 'b', 'after'), ['a', 'b']);
	assert.deepEqual(reorderIds(['a', 'b'], 'a', 'missing', 'after'), ['a', 'b']);
});

test('adjacent insertion slots that preserve order are not reorder targets', () => {
	assert.equal(reorderIdsIfChanged(['a', 'b', 'c'], 'a', 'b', 'before'), null);
	assert.equal(reorderIdsIfChanged(['a', 'b', 'c'], 'b', 'a', 'after'), null);
	assert.deepEqual(reorderIdsIfChanged(['a', 'b', 'c'], 'a', 'b', 'after'), ['b', 'a', 'c']);
});
