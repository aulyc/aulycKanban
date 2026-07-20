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
	assert.equal(
		selectors[0].includes('.aulyckanban-task-pane:not(.aulyckanban-mode-archive)'),
		true,
	);
	assert.equal(selectors[1].includes('.aulyckanban-task-search-input'), false);
	assert.equal(selectors[1].includes('.aulyckanban-task-add-btn'), true);
});

test('an empty archive task zone focuses its visible archive container', () => {
	const archiveContainer = { id: 'archive-container' };
	const root = {
		querySelector(selector) {
			if (selector.includes('.aulyckanban-archive-container')) return archiveContainer;
			return null;
		},
	};
	assert.equal(getTaskZoneFocusTarget(root), archiveContainer);
});

test('utility focus and arrow navigation contain search plus archive only', () => {
	const search = { id: 'search' };
	const archive = { id: 'archive' };
	const selectors = [];
	const root = {
		querySelector(selector) {
			selectors.push(selector);
			return search;
		},
		querySelectorAll(selector) {
			selectors.push(selector);
			return [search, archive];
		},
	};

	assert.equal(getUtilityZoneFocusTarget(root), search);
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

test('task type navigation contains existing task types and the retained add control', () => {
	const afterFirstView = getTaskTypeNavigationTarget(['work', 'personal'], 'work', 1);
	assert.equal(afterFirstView?.kind, 'view');
	assert.equal(afterFirstView?.id, 'personal');

	const afterLastView = getTaskTypeNavigationTarget(['work', 'personal'], 'personal', 1);
	assert.equal(afterLastView?.kind, 'add');

	const afterAdd = getTaskTypeNavigationTarget(['work', 'personal'], 'personal', 1, {
		kind: 'add',
	});
	assert.equal(afterAdd?.kind, 'view');
	assert.equal(afterAdd?.id, 'work');

	const beforeFirstView = getTaskTypeNavigationTarget(['work', 'personal'], 'work', -1);
	assert.equal(beforeFirstView?.kind, 'add');
});

test('quadrant navigation contains existing quadrants and the retained add control', () => {
	assert.equal(getColumnNavigationTarget(['base', 'later'], 'base', 1)?.id, 'later');
	assert.equal(getColumnNavigationTarget(['base', 'later'], 'later', 1)?.kind, 'add');
	assert.equal(getColumnNavigationTarget(['base', 'later'], 'base', -1)?.kind, 'add');
	assert.equal(
		getColumnNavigationTarget(['base', 'later'], 'later', 1, { kind: 'add' })?.id,
		'base',
	);
});
