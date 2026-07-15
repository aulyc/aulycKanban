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
	getColumnNavigationTarget,
	getNextFocusZone,
	getTaskZoneFocusTarget,
	getTaskZoneNavigationItems,
	getTaskTypeNavigationTarget,
	getWrappedItemIndex,
	shouldUseTabFocusFallback,
} = module.exports;

test('empty task zones ignore hidden results and focus the shared search control', () => {
	const visibleInput = { id: 'task-search' };
	const selectors = [];
	const root = {
		querySelector(selector) {
			selectors.push(selector);
			if (selector.includes('.aulyckanban-task-search-input')) return visibleInput;
			return null;
		},
	};

	assert.equal(getTaskZoneFocusTarget(root), visibleInput);
	assert.equal(
		selectors[0].includes('.aulyckanban-task-pane:not(.aulyckanban-mode-archive)'),
		true,
	);
	assert.equal(selectors[1].includes('.aulyckan-task-search-input'), false);
	assert.equal(selectors[1].includes('.aulyckanban-task-search-input'), true);
});

test('task arrow navigation includes shared controls and only the visible result mode', () => {
	const visibleInput = { id: 'task-search' };
	const selectors = [];
	const root = {
		querySelectorAll(selector) {
			selectors.push(selector);
			return [visibleInput];
		},
	};

	const items = getTaskZoneNavigationItems(root);
	assert.equal(items.length, 1);
	assert.equal(items[0], visibleInput);
	assert.equal(selectors[0].includes('.aulyckanban-task-create-target'), true);
	assert.equal(selectors[0].includes('.aulyckanban-task-create-input'), true);
	assert.equal(selectors[0].includes('.aulyckanban-mode-archive'), true);
});

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

test('orphaned Tab uses the fallback only for the active kanban view', () => {
	const base = {
		key: 'Tab',
		defaultPrevented: false,
		viewIsActive: true,
		eventPathIncludesView: false,
		activeElementIsInsideView: true,
		documentLevelTarget: false,
	};

	assert.equal(shouldUseTabFocusFallback(base), true);
	assert.equal(
		shouldUseTabFocusFallback({
			...base,
			activeElementIsInsideView: false,
			documentLevelTarget: true,
		}),
		true,
	);
	assert.equal(shouldUseTabFocusFallback({ ...base, viewIsActive: false }), false);
});

test('Tab fallback leaves normal view events and external controls alone', () => {
	const base = {
		key: 'Tab',
		defaultPrevented: false,
		viewIsActive: true,
		eventPathIncludesView: false,
		activeElementIsInsideView: true,
		documentLevelTarget: true,
	};

	assert.equal(shouldUseTabFocusFallback({ ...base, eventPathIncludesView: true }), false);
	assert.equal(
		shouldUseTabFocusFallback({
			...base,
			activeElementIsInsideView: false,
			documentLevelTarget: false,
		}),
		false,
	);
	assert.equal(shouldUseTabFocusFallback({ ...base, defaultPrevented: true }), false);
	assert.equal(shouldUseTabFocusFallback({ ...base, key: 'Enter' }), false);
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

test('all tasks is fixed first while add and archive remain the last task type navigation items', () => {
	const afterAll = getTaskTypeNavigationTarget(['work', 'personal'], 'work', 'all', 1);
	assert.equal(afterAll?.kind, 'view');
	assert.equal(afterAll?.id, 'work');

	const afterLastView = getTaskTypeNavigationTarget(['work', 'personal'], 'personal', 'current', 1);
	assert.equal(afterLastView?.kind, 'add');

	const afterAdd = getTaskTypeNavigationTarget(['work', 'personal'], 'personal', 'current', 1, {
		kind: 'add',
	});
	assert.equal(afterAdd?.kind, 'archive');

	const afterArchive = getTaskTypeNavigationTarget(['work', 'personal'], 'work', 'archive', 1);
	assert.equal(afterArchive?.kind, 'all');

	const beforeFirstView = getTaskTypeNavigationTarget(['work', 'personal'], 'work', 'current', -1);
	assert.equal(beforeFirstView?.kind, 'all');

	const beforeAll = getTaskTypeNavigationTarget(['work', 'personal'], 'work', 'all', -1);
	assert.equal(beforeAll?.kind, 'archive');

	const beforeArchive = getTaskTypeNavigationTarget(
		['work', 'personal'],
		'personal',
		'archive',
		-1,
		{
			kind: 'archive',
		},
	);
	assert.equal(beforeArchive?.kind, 'add');
});

test('all quadrants is fixed first and the add quadrant control remains last', () => {
	assert.equal(getColumnNavigationTarget(['base', 'later'], 'base', 'all', 1)?.id, 'base');
	assert.equal(getColumnNavigationTarget(['base', 'later'], 'later', 'current', 1)?.kind, 'add');
	assert.equal(getColumnNavigationTarget(['base', 'later'], 'base', 'current', -1)?.kind, 'all');
	assert.equal(getColumnNavigationTarget(['base', 'later'], 'base', 'all', -1)?.kind, 'add');
});
