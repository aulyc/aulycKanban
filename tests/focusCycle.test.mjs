import assert from 'node:assert/strict';
import test from 'node:test';
import focusCycleModule from '../src/utils/focusCycle.ts';

const {
	getHorizontalRevealScrollLeft,
	getColumnNavigationTarget,
	getNextFocusZone,
	getTaskZoneFocusTarget,
	getTaskZoneNavigationItems,
	getTaskTypeNavigationTarget,
	getUtilityZoneFocusTarget,
	getUtilityZoneNavigationItems,
	getWrappedItemIndex,
	shouldUseTabFocusFallback,
} = focusCycleModule;

test('empty task zones ignore hidden results and focus the task add control', () => {
	const addButton = { id: 'task-add' };
	const selectors = [];
	const root = {
		querySelector(selector) {
			selectors.push(selector);
			if (selector.includes('.aulyckanban-task-add-btn')) return addButton;
			return null;
		},
	};

	assert.equal(getTaskZoneFocusTarget(root), addButton);
	const taskControlSelector = selectors.find((selector) =>
		selector.includes('.aulyckanban-task-add-btn'),
	);
	assert.equal(
		selectors[0].includes('.aulyckanban-task-pane:not(.aulyckanban-mode-archive)'),
		true,
	);
	assert.equal(taskControlSelector.includes('.aulyckanban-task-search-input'), false);
	assert.equal(
		taskControlSelector.includes('.aulyckanban-task-pane:not(.aulyckanban-mode-archive)'),
		true,
	);
});

test('an empty archive task zone focuses its localized sort control', () => {
	const archiveSortButton = { id: 'archive-sort' };
	const root = {
		querySelector(selector) {
			if (selector.includes('.aulyckanban-archive-sort-btn')) return archiveSortButton;
			return null;
		},
	};
	assert.equal(getTaskZoneFocusTarget(root), archiveSortButton);
});

test('a non-empty archive task zone focuses the first archive card before its toolbar', () => {
	const archiveTask = { id: 'archive-task' };
	const archiveSortButton = { id: 'archive-sort' };
	const root = {
		querySelector(selector) {
			if (selector.includes('.aulyckanban-archive-task')) return archiveTask;
			if (selector.includes('.aulyckanban-archive-sort-btn')) return archiveSortButton;
			return null;
		},
	};
	assert.equal(getTaskZoneFocusTarget(root), archiveTask);
});

test('utility focus and arrow navigation contain search plus archive only', () => {
	const search = { id: 'search' };
	const archive = { id: 'archive' };
	const selectors = [];
	const root = {
		querySelector(selector) {
			selectors.push(selector);
			return selector === '.aulyckanban-archive-btn' ? archive : search;
		},
		querySelectorAll(selector) {
			selectors.push(selector);
			return [search, archive];
		},
	};

	assert.equal(getUtilityZoneFocusTarget(root), archive);
	assert.deepEqual(getUtilityZoneNavigationItems(root), [search, archive]);
	assert.equal(
		selectors.every((selector) => selector.includes('.aulyckanban-archive-btn')),
		true,
	);
	assert.equal(
		selectors.every((selector) => selector.includes('.aulyckanban-task-add-btn')),
		false,
	);
});

test('task arrow navigation includes add controls and only the visible result mode', () => {
	const addButton = { id: 'task-add' };
	const selectors = [];
	const root = {
		querySelectorAll(selector) {
			selectors.push(selector);
			return [addButton];
		},
	};

	const items = getTaskZoneNavigationItems(root);
	assert.equal(items.length, 1);
	assert.equal(items[0], addButton);
	assert.equal(selectors[0].includes('.aulyckanban-task-create-target'), true);
	assert.equal(selectors[0].includes('.aulyckanban-task-create-input'), true);
	assert.equal(selectors[0].includes('.aulyckanban-mode-archive'), true);
	assert.equal(selectors[0].includes('.aulyckanban-task-search-input'), false);
});

test('Tab cycles utility, view, tasks, columns, then utility', () => {
	assert.equal(getNextFocusZone(null), 'utility');
	assert.equal(getNextFocusZone('utility'), 'view');
	assert.equal(getNextFocusZone('view'), 'tasks');
	assert.equal(getNextFocusZone('tasks'), 'columns');
	assert.equal(getNextFocusZone('columns'), 'utility');
});

test('Shift+Tab cycles in reverse order', () => {
	assert.equal(getNextFocusZone(null, true), 'columns');
	assert.equal(getNextFocusZone('columns', true), 'tasks');
	assert.equal(getNextFocusZone('tasks', true), 'view');
	assert.equal(getNextFocusZone('view', true), 'utility');
	assert.equal(getNextFocusZone('utility', true), 'columns');
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

test('task type navigation contains all tasks, existing task types, and the retained add control', () => {
	const afterAll = getTaskTypeNavigationTarget(['work', 'personal'], 'work', 'all', 1);
	assert.equal(afterAll?.kind, 'view');
	assert.equal(afterAll?.id, 'work');

	const afterFirstView = getTaskTypeNavigationTarget(['work', 'personal'], 'work', 'current', 1);
	assert.equal(afterFirstView?.kind, 'view');
	assert.equal(afterFirstView?.id, 'personal');

	const afterLastView = getTaskTypeNavigationTarget(['work', 'personal'], 'personal', 'current', 1);
	assert.equal(afterLastView?.kind, 'add');

	const afterAdd = getTaskTypeNavigationTarget(['work', 'personal'], 'personal', 'current', 1, {
		kind: 'add',
	});
	assert.equal(afterAdd?.kind, 'all');

	const beforeFirstView = getTaskTypeNavigationTarget(['work', 'personal'], 'work', 'current', -1);
	assert.equal(beforeFirstView?.kind, 'all');
});

test('quadrant navigation keeps all quadrants first and the retained add control last', () => {
	assert.equal(getColumnNavigationTarget(['base', 'later'], 'base', 'all', 1)?.id, 'base');
	assert.equal(getColumnNavigationTarget(['base', 'later'], 'later', 'current', 1)?.kind, 'add');
	assert.equal(getColumnNavigationTarget(['base', 'later'], 'base', 'current', -1)?.kind, 'all');
	assert.equal(getColumnNavigationTarget(['base', 'later'], 'base', 'all', -1)?.kind, 'add');
	assert.equal(
		getColumnNavigationTarget(['base', 'later'], 'later', 'current', 1, { kind: 'add' })?.kind,
		'all',
	);
});
