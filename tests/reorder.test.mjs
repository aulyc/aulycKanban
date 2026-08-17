import assert from 'node:assert/strict';
import test from 'node:test';
import reorderModule from '../src/utils/reorder.ts';

const { getReorderSide, reorderIds } = reorderModule;

test('drop side follows the pointer half of the target item', () => {
	assert.equal(getReorderSide(24, 10, 30), 'before');
	assert.equal(getReorderSide(25, 10, 30), 'after');
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
