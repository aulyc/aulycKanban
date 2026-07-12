import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/focusCycle.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(output, { module, exports: module.exports });

const {
	getHorizontalRevealScrollLeft,
	getNextFocusZone,
	getTaskTypeNavigationTarget,
	getWrappedItemIndex,
} = module.exports;

test('Tab cycles view, tasks, columns, then view', () => {
	assert.equal(getNextFocusZone(null), 'view');
	assert.equal(getNextFocusZone('view'), 'tasks');
	assert.equal(getNextFocusZone('tasks'), 'columns');
	assert.equal(getNextFocusZone('columns'), 'view');
});

test('Shift+Tab cycles in reverse order', () => {
	assert.equal(getNextFocusZone(null, true), 'columns');
	assert.equal(getNextFocusZone('columns', true), 'tasks');
	assert.equal(getNextFocusZone('tasks', true), 'view');
	assert.equal(getNextFocusZone('view', true), 'columns');
});

test('arrow navigation wraps at both ends', () => {
	assert.equal(getWrappedItemIndex(0, 3, -1), 2);
	assert.equal(getWrappedItemIndex(2, 3, 1), 0);
	assert.equal(getWrappedItemIndex(1, 3, 1), 2);
	assert.equal(getWrappedItemIndex(0, 0, 1), -1);
});

test('horizontal task type navigation reveals clipped items without a visible scrollbar', () => {
	assert.equal(getHorizontalRevealScrollLeft(100, 20, 220, 0, 80), 80);
	assert.equal(getHorizontalRevealScrollLeft(100, 20, 220, 180, 260), 140);
	assert.equal(getHorizontalRevealScrollLeft(100, 20, 220, 40, 180), 100);
	assert.equal(getHorizontalRevealScrollLeft(10, 20, 220, -50, 20), 0);
});

test('add and archive are the fixed last task type navigation items', () => {
	const afterLastView = getTaskTypeNavigationTarget(['work', 'personal'], 'personal', false, 1);
	assert.equal(afterLastView?.kind, 'add');

	const afterAdd = getTaskTypeNavigationTarget(
		['work', 'personal'],
		'personal',
		false,
		1,
		{ kind: 'add' },
	);
	assert.equal(afterAdd?.kind, 'archive');

	const afterArchive = getTaskTypeNavigationTarget(['work', 'personal'], 'work', true, 1);
	assert.equal(afterArchive?.kind, 'view');
	assert.equal(afterArchive?.id, 'work');

	const beforeFirstView = getTaskTypeNavigationTarget(['work', 'personal'], 'work', false, -1);
	assert.equal(beforeFirstView?.kind, 'archive');

	const beforeArchive = getTaskTypeNavigationTarget(
		['work', 'personal'],
		'personal',
		true,
		-1,
		{ kind: 'archive' },
	);
	assert.equal(beforeArchive?.kind, 'add');
});
