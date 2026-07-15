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
	getTaskZoneFocusTarget,
	getTaskZoneNavigationItems,
	getTaskTypeNavigationTarget,
	getWrappedItemIndex,
	shouldUseTabFocusFallback,
} = module.exports;

test('empty task zones ignore hidden archive cards and focus the persistent input', () => {
	const visibleInput = { id: 'task-input' };
	const hiddenArchiveCard = { id: 'archive-card' };
	const selectors = [];
	const root = {
		querySelector(selector) {
			selectors.push(selector);
			if (selector === '.aulyckanban-task') return hiddenArchiveCard;
			if (selector === '.aulyckanban-task-list .aulyckanban-inline-input') return visibleInput;
			return null;
		},
	};

	assert.equal(getTaskZoneFocusTarget(root), visibleInput);
	assert.deepEqual(selectors, [
		'.aulyckanban-task-list .aulyckanban-task',
		'.aulyckanban-task-list .aulyckanban-inline-input',
	]);
});

test('task arrow navigation excludes hidden archive cards', () => {
	const visibleInput = { id: 'task-input' };
	const hiddenArchiveCard = { id: 'archive-card' };
	const selectors = [];
	const root = {
		querySelectorAll(selector) {
			selectors.push(selector);
			if (selector === '.aulyckanban-inline-input, .aulyckanban-task') {
				return [visibleInput, hiddenArchiveCard];
			}
			return [visibleInput];
		},
	};

	const items = getTaskZoneNavigationItems(root);
	assert.equal(items.length, 1);
	assert.equal(items[0], visibleInput);
	assert.deepEqual(selectors, [
		'.aulyckanban-task-list .aulyckanban-inline-input, ' +
			'.aulyckanban-task-list .aulyckanban-task',
	]);
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

test('add and archive are the fixed last task type navigation items', () => {
	const afterLastView = getTaskTypeNavigationTarget(['work', 'personal'], 'personal', false, 1);
	assert.equal(afterLastView?.kind, 'add');

	const afterAdd = getTaskTypeNavigationTarget(['work', 'personal'], 'personal', false, 1, {
		kind: 'add',
	});
	assert.equal(afterAdd?.kind, 'archive');

	const afterArchive = getTaskTypeNavigationTarget(['work', 'personal'], 'work', true, 1);
	assert.equal(afterArchive?.kind, 'view');
	assert.equal(afterArchive?.id, 'work');

	const beforeFirstView = getTaskTypeNavigationTarget(['work', 'personal'], 'work', false, -1);
	assert.equal(beforeFirstView?.kind, 'archive');

	const beforeArchive = getTaskTypeNavigationTarget(['work', 'personal'], 'personal', true, -1, {
		kind: 'archive',
	});
	assert.equal(beforeArchive?.kind, 'add');
});
