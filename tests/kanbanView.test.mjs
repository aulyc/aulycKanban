import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

class MockElement {
	constructor(ownerDocument, options = {}) {
		this.ownerDocument = ownerDocument;
		this.children = [];
		this.parentElement = null;
		this.dataset = { ...(options.dataset ?? {}) };
		this.attributes = {};
		this.listeners = new Map();
		this.classes = new Set(
			String(options.cls ?? '')
				.split(/\s+/)
				.filter(Boolean),
		);
		this.focusCalls = [];
		this.blurCount = 0;
		this.scrollCalls = [];
		this.emptyCount = 0;
		this.value = options.value ?? '';
		this.classList = {
			contains: (value) => this.classes.has(value),
			add: (value) => this.classes.add(value),
			remove: (value) => this.classes.delete(value),
		};
		this.doc = ownerDocument;
		this.win = ownerDocument.defaultView;
	}

	append(child) {
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	empty() {
		this.children = [];
		this.emptyCount += 1;
	}

	addClass(value) {
		this.classes.add(value);
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
	}

	addEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push(listener);
		this.listeners.set(name, listeners);
	}

	removeEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		this.listeners.set(
			name,
			listeners.filter((candidate) => candidate !== listener),
		);
	}

	contains(candidate) {
		for (let current = candidate; current; current = current.parentElement) {
			if (current === this) return true;
		}
		return false;
	}

	matches(selector) {
		return selector.split(',').some((part) => {
			const classes = [...part.matchAll(/\.([a-z0-9_-]+)/giu)].map((match) => match[1]);
			return classes.length > 0 && classes.every((className) => this.classes.has(className));
		});
	}

	closest(selector) {
		for (let current = this; current; current = current.parentElement) {
			if (current.matches(selector)) return current;
		}
		return null;
	}

	querySelector(selector) {
		return descendants(this).find((element) => element.matches(selector)) ?? null;
	}

	querySelectorAll(selector) {
		return descendants(this).filter((element) => element.matches(selector));
	}

	focus(options) {
		this.focusCalls.push(options);
		this.ownerDocument.activeElement = this;
	}

	blur() {
		this.blurCount += 1;
		if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null;
	}

	scrollIntoView(options) {
		this.scrollCalls.push(options);
	}
}

class MockTextAreaElement extends MockElement {}

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}

class MockWindow {
	constructor() {
		this.listeners = new Map();
		this.HTMLElement = MockElement;
	}

	addEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push(listener);
		this.listeners.set(name, listeners);
	}

	removeEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		this.listeners.set(
			name,
			listeners.filter((candidate) => candidate !== listener),
		);
	}
}

class MockItemView {
	constructor(leaf) {
		this.leaf = leaf;
		this.app = leaf.app;
		this.contentEl = leaf.contentEl;
		this.containerEl = leaf.containerEl;
	}
}

let boardInstances = [];
class MockBoard {
	constructor(container, app, store) {
		this.container = container;
		this.app = app;
		this.store = store;
		this.renderCount = 0;
		this.destroyCount = 0;
		boardInstances.push(this);
	}

	render() {
		this.renderCount += 1;
	}

	destroy() {
		this.destroyCount += 1;
	}
}

let resizeUpdates = [];
let resizeClears = [];
let utilityFocusTarget = null;
let utilityNavigationItems = [];
let taskFocusTarget = null;
let taskNavigationItems = [];
let nextViewNavigationTarget = null;
let nextColumnNavigationTarget = null;
let viewNavigationCalls = [];
let columnNavigationCalls = [];
let revealedItems = [];

const focusOrder = ['utility', 'view', 'tasks', 'columns'];
const focusMocks = {
	getNextFocusZone(current, reverse = false) {
		if (current === null) return reverse ? 'columns' : 'utility';
		const index = focusOrder.indexOf(current);
		return focusOrder[(index + (reverse ? -1 : 1) + focusOrder.length) % focusOrder.length];
	},
	getColumnNavigationTarget(...args) {
		columnNavigationCalls.push(args);
		return nextColumnNavigationTarget;
	},
	getTaskZoneFocusTarget: () => taskFocusTarget,
	getTaskZoneNavigationItems: () => taskNavigationItems,
	getUtilityZoneFocusTarget: () => utilityFocusTarget,
	getUtilityZoneNavigationItems: () => utilityNavigationItems,
	getTaskTypeNavigationTarget(...args) {
		viewNavigationCalls.push(args);
		return nextViewNavigationTarget;
	},
	getWrappedItemIndex(currentIndex, length, offset) {
		if (length <= 0) return -1;
		const safeCurrent = currentIndex >= 0 ? currentIndex : 0;
		return (safeCurrent + offset + length) % length;
	},
	revealTaskTypeItem: (item) => revealedItems.push(item),
	shouldUseTabFocusFallback(context) {
		return (
			context.key === 'Tab' &&
			!context.defaultPrevented &&
			context.viewIsActive &&
			!context.eventPathIncludesView &&
			(context.activeElementIsInsideView || context.documentLevelTarget)
		);
	},
};

const { KanbanView } = await loadSourceModule(new URL('../src/ui/KanbanView.ts', import.meta.url), {
	label: 'kanban-view',
	mocks: {
		obsidian: { ItemView: MockItemView, WorkspaceLeaf: class {} },
		'../constants': { VIEW_TYPE_KANBAN: 'aulyckanban-view' },
		'../i18n': { t: (key) => (key === 'view.displayName' ? 'aulycKanban' : key) },
		'./Board': { Board: MockBoard },
		'../utils/resizeHost': {
			clearResizeHost: (host) => resizeClears.push(host),
			updateResizeHost: (previous, container) => {
				const host = { id: `resize-host-${resizeUpdates.length + 1}` };
				resizeUpdates.push({ previous, container, host });
				return host;
			},
		},
		'../utils/focusCycle': focusMocks,
	},
});

function createDocument() {
	const documentRef = { activeElement: null };
	const windowRef = new MockWindow();
	documentRef.defaultView = windowRef;
	documentRef.body = new MockElement(documentRef, { cls: 'body' });
	documentRef.documentElement = new MockElement(documentRef, { cls: 'html' });
	return { documentRef, windowRef };
}

function createStore() {
	const state = {
		listener: null,
		unsubscribeCount: 0,
		actions: [],
		taskScope: 'current',
		columnScope: 'current',
		currentView: 'work',
		activeColumn: 'base',
	};
	return {
		state,
		subscribe(listener) {
			state.listener = listener;
			return () => {
				state.unsubscribeCount += 1;
			};
		},
		getTaskViews: () => [
			{ id: 'work', title: '工作' },
			{ id: 'personal', title: '个人' },
		],
		getCurrentView: () => state.currentView,
		getTaskScope: () => state.taskScope,
		isShowingArchive: () => state.taskScope === 'archive',
		isShowingAllTasks: () => state.taskScope === 'all',
		getCurrentColumns: () => [
			{ id: 'base', title: '基础' },
			{ id: 'later', title: '稍后' },
		],
		getActiveColumnId: () => state.activeColumn,
		getColumnScope: () => state.columnScope,
		isShowingAllColumns: () => state.columnScope === 'all',
		dispatch(action) {
			state.actions.push(action);
			if (action.type === 'SHOW_ALL_TASKS') state.taskScope = 'all';
			if (action.type === 'TOGGLE_ARCHIVE_VIEW') {
				state.taskScope = state.taskScope === 'archive' ? 'current' : 'archive';
			}
			if (action.type === 'SWITCH_VIEW') {
				state.taskScope = 'current';
				state.currentView = action.payload.view;
			}
			if (action.type === 'SHOW_ALL_COLUMNS') state.columnScope = 'all';
			if (action.type === 'SELECT_COLUMN') {
				state.columnScope = 'current';
				state.activeColumn = action.payload.columnId;
			}
		},
	};
}

function createHarness() {
	boardInstances = [];
	resizeUpdates = [];
	resizeClears = [];
	utilityFocusTarget = null;
	utilityNavigationItems = [];
	taskFocusTarget = null;
	taskNavigationItems = [];
	nextViewNavigationTarget = null;
	nextColumnNavigationTarget = null;
	viewNavigationCalls = [];
	columnNavigationCalls = [];
	revealedItems = [];
	const animationFrames = [];
	const { documentRef, windowRef } = createDocument();
	globalThis.document = documentRef;
	globalThis.HTMLElement = MockElement;
	globalThis.HTMLTextAreaElement = MockTextAreaElement;
	windowRef.requestAnimationFrame = (callback) => {
		animationFrames.push(callback);
		return animationFrames.length;
	};
	const contentEl = new MockElement(documentRef, { cls: 'view-content' });
	const containerEl = new MockElement(documentRef, { cls: 'view-container' });
	const store = createStore();
	let activeView = null;
	const app = {
		workspace: {
			getActiveViewOfType: () => activeView,
		},
	};
	const view = new KanbanView({ app, contentEl, containerEl }, { store });
	activeView = view;
	return {
		app,
		contentEl,
		containerEl,
		documentRef,
		windowRef,
		store,
		view,
		setActiveView(value) {
			activeView = value;
		},
		flushAnimationFrames() {
			while (animationFrames.length > 0) animationFrames.shift()();
		},
		getAnimationFrameCount: () => animationFrames.length,
	};
}

function child(parent, cls, dataset = {}) {
	return parent.append(new MockElement(parent.ownerDocument, { cls, dataset }));
}

function keyEvent(
	key,
	{
		shiftKey = false,
		metaKey = false,
		ctrlKey = false,
		altKey = false,
		isComposing = false,
		target = null,
		path = [],
	} = {},
) {
	return {
		key,
		shiftKey,
		metaKey,
		ctrlKey,
		altKey,
		isComposing,
		target,
		defaultPrevented: false,
		propagationStopped: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {
			this.propagationStopped = true;
		},
		composedPath: () => path,
	};
}

test('window capture handles Command+F before Obsidian without changing task state', async () => {
	const harness = createHarness();
	await harness.view.onOpen();
	const utility = child(harness.contentEl, 'aulyckanban-utility-bar');
	const search = child(utility, 'aulyckanban-task-search-input');
	const taskPane = child(harness.contentEl, 'aulyckanban-task-pane');
	const task = child(taskPane, 'aulyckanban-task');
	task.focus();
	const actionCount = harness.store.state.actions.length;

	const commandFind = keyEvent('f', {
		metaKey: true,
		target: task,
		path: [task, taskPane, harness.contentEl],
	});
	dispatchKey(harness.windowRef, commandFind);

	assert.equal(commandFind.defaultPrevented, true);
	assert.equal(commandFind.propagationStopped, true);
	assert.equal(harness.documentRef.activeElement, search);
	assert.deepEqual(search.focusCalls.at(-1), { preventScroll: true });
	assert.equal(harness.store.state.actions.length, actionCount);

	task.focus();
	const controlFind = keyEvent('f', { ctrlKey: true, target: task });
	dispatchKey(harness.windowRef, controlFind);
	assert.equal(controlFind.defaultPrevented, false);
	assert.equal(harness.documentRef.activeElement, task);

	harness.setActiveView(null);
	const inactiveFind = keyEvent('f', {
		metaKey: true,
		target: task,
		path: [task, taskPane, harness.contentEl],
	});
	dispatchKey(harness.windowRef, inactiveFind);
	assert.equal(inactiveFind.defaultPrevented, false);
	assert.equal(harness.documentRef.activeElement, task);
});

function dispatchKey(target, event) {
	for (const listener of target.listeners.get('keydown') ?? []) listener(event);
}

test('kanban view exposes its identity and manages render, resize, focus, and close lifecycles', async () => {
	const harness = createHarness();
	assert.equal(harness.view.getViewType(), 'aulyckanban-view');
	assert.equal(harness.view.getDisplayText(), 'aulycKanban');
	assert.equal(harness.view.getIcon(), 'list-todo');

	await harness.view.onOpen();
	const board = boardInstances[0];
	assert.equal(harness.contentEl.emptyCount, 1);
	assert.equal(harness.contentEl.classes.has('aulyckanban-kanban-container'), true);
	assert.equal(harness.contentEl.attributes.tabindex, '0');
	assert.equal(board.container, harness.contentEl);
	assert.equal(board.store, harness.store);
	assert.equal(board.renderCount, 1);
	assert.equal(resizeUpdates.length, 1);
	assert.equal((harness.contentEl.listeners.get('keydown') ?? []).length, 1);
	assert.equal((harness.windowRef.listeners.get('keydown') ?? []).length, 1);

	const subscribedRender = harness.store.state.listener;
	subscribedRender();
	subscribedRender();
	assert.equal(harness.getAnimationFrameCount(), 1);
	harness.flushAnimationFrames();
	assert.equal(board.renderCount, 2);

	harness.view.onResize();
	assert.equal(resizeUpdates.length, 2);
	assert.equal(resizeUpdates[1].previous, resizeUpdates[0].host);

	harness.view.focusBoard();
	harness.flushAnimationFrames();
	assert.equal(harness.documentRef.activeElement, harness.contentEl);
	assert.deepEqual(harness.contentEl.focusCalls.at(-1), { preventScroll: true });

	subscribedRender();
	assert.equal(harness.getAnimationFrameCount(), 1);
	await harness.view.onClose();
	harness.flushAnimationFrames();
	assert.deepEqual(resizeClears, [resizeUpdates[1].host]);
	assert.equal(board.renderCount, 2);
	assert.equal(harness.store.state.unsubscribeCount, 1);
	assert.equal(board.destroyCount, 1);
	assert.equal((harness.contentEl.listeners.get('keydown') ?? []).length, 0);
	assert.equal((harness.windowRef.listeners.get('keydown') ?? []).length, 0);

	subscribedRender();
	harness.view.focusBoard();
	harness.flushAnimationFrames();
	assert.equal(board.renderCount, 2);
});

test('Tab and window fallback move focus between real view zones without escaping the active board', async () => {
	const harness = createHarness();
	await harness.view.onOpen();
	const utility = child(harness.contentEl, 'aulyckanban-utility-bar');
	child(utility, 'aulyckanban-task-search-input');
	const archive = child(utility, 'aulyckanban-archive-btn');
	const toolbar = child(harness.contentEl, 'aulyckanban-toolbar');
	const viewTab = child(toolbar, 'aulyckanban-view-tab aulyckanban-tab-active', { viewId: 'work' });
	const taskPane = child(harness.contentEl, 'aulyckanban-task-pane');
	const task = child(taskPane, 'aulyckanban-task');
	const columns = child(harness.contentEl, 'aulyckanban-category-nav');
	const column = child(columns, 'aulyckanban-nav-item-active');
	utilityFocusTarget = archive;
	taskFocusTarget = task;

	viewTab.focus();
	const actionCount = harness.store.state.actions.length;
	const tab = keyEvent('Tab', { target: viewTab, path: [viewTab, toolbar, harness.contentEl] });
	dispatchKey(harness.contentEl, tab);
	assert.equal(tab.defaultPrevented, true);
	assert.equal(tab.propagationStopped, true);
	assert.equal(harness.documentRef.activeElement, task);
	assert.deepEqual(task.scrollCalls, [{ block: 'nearest' }]);
	assert.equal(harness.store.state.actions.length, actionCount);

	const reverseTab = keyEvent('Tab', {
		shiftKey: true,
		target: task,
		path: [task, taskPane, harness.contentEl],
	});
	dispatchKey(harness.contentEl, reverseTab);
	assert.equal(harness.documentRef.activeElement, viewTab);
	assert.deepEqual(revealedItems, [viewTab]);

	harness.documentRef.activeElement = harness.documentRef.body;
	const fallbackTab = keyEvent('Tab', { target: harness.documentRef.body, path: [] });
	dispatchKey(harness.windowRef, fallbackTab);
	assert.equal(fallbackTab.defaultPrevented, true);
	assert.equal(harness.documentRef.activeElement, archive);

	harness.setActiveView(null);
	harness.documentRef.activeElement = harness.documentRef.body;
	const inactiveTab = keyEvent('Tab', { target: harness.documentRef.body, path: [] });
	dispatchKey(harness.windowRef, inactiveTab);
	assert.equal(inactiveTab.defaultPrevented, false);
	assert.equal(harness.documentRef.activeElement, harness.documentRef.body);
	assert.ok(column);
});

test('Tab leaving archive restores the ordinary task list before moving through later zones', async () => {
	const harness = createHarness();
	await harness.view.onOpen();
	const utility = child(harness.contentEl, 'aulyckanban-utility-bar');
	const archive = child(utility, 'aulyckanban-archive-btn');
	const toolbar = child(harness.contentEl, 'aulyckanban-toolbar');
	const viewTab = child(toolbar, 'aulyckanban-view-tab aulyckanban-tab-active', {
		viewId: 'work',
	});
	const taskPane = child(harness.contentEl, 'aulyckanban-task-pane');
	const task = child(taskPane, 'aulyckanban-task');
	taskFocusTarget = task;
	harness.store.state.taskScope = 'archive';
	archive.focus();

	const leaveArchive = keyEvent('Tab', {
		target: archive,
		path: [archive, utility, harness.contentEl],
	});
	dispatchKey(harness.contentEl, leaveArchive);

	assert.equal(leaveArchive.defaultPrevented, true);
	assert.equal(harness.store.state.taskScope, 'current');
	assert.equal(harness.store.state.actions.at(-1).type, 'TOGGLE_ARCHIVE_VIEW');
	assert.equal(harness.documentRef.activeElement, archive);
	harness.flushAnimationFrames();
	assert.equal(harness.documentRef.activeElement, viewTab);

	dispatchKey(
		harness.contentEl,
		keyEvent('Tab', { target: viewTab, path: [viewTab, toolbar, harness.contentEl] }),
	);
	assert.equal(harness.documentRef.activeElement, task);
	assert.equal(harness.store.state.taskScope, 'current');
});

test('arrow navigation moves within all four zones and dispatches real selections', async () => {
	const harness = createHarness();
	await harness.view.onOpen();
	const utility = child(harness.contentEl, 'aulyckanban-utility-bar');
	const search = child(utility, 'aulyckanban-task-search-input');
	const archive = child(utility, 'aulyckanban-archive-btn');
	const toolbar = child(harness.contentEl, 'aulyckanban-toolbar');
	const viewTab = child(toolbar, 'aulyckanban-view-tab aulyckanban-tab-active', { viewId: 'work' });
	const addView = child(toolbar, 'aulyckanban-view-add-btn');
	const columnNav = child(harness.contentEl, 'aulyckanban-category-nav');
	const column = child(columnNav, 'aulyckanban-nav-item aulyckanban-nav-item-active', {
		columnId: 'base',
	});
	const addColumn = child(columnNav, 'aulyckanban-nav-add-btn');
	const taskPane = child(harness.contentEl, 'aulyckanban-task-pane');
	const firstTask = child(taskPane, 'aulyckanban-task');
	const secondTask = child(taskPane, 'aulyckanban-task');

	utilityNavigationItems = [search, archive];
	search.focus();
	dispatchKey(harness.contentEl, keyEvent('ArrowRight', { target: search }));
	assert.equal(harness.documentRef.activeElement, archive);
	dispatchKey(harness.contentEl, keyEvent('ArrowRight', { target: archive }));
	assert.equal(harness.documentRef.activeElement, search);

	viewTab.focus();
	nextViewNavigationTarget = { kind: 'add' };
	dispatchKey(harness.contentEl, keyEvent('ArrowRight', { target: viewTab }));
	assert.equal(harness.documentRef.activeElement, addView);
	assert.equal(revealedItems.at(-1), addView);

	viewTab.focus();
	nextViewNavigationTarget = { kind: 'view', id: 'personal' };
	dispatchKey(harness.contentEl, keyEvent('ArrowRight', { target: viewTab }));
	assert.equal(harness.store.state.actions.at(-1).type, 'SWITCH_VIEW');
	assert.equal(harness.store.state.actions.at(-1).payload.view, 'personal');
	harness.flushAnimationFrames();

	column.focus();
	nextColumnNavigationTarget = { kind: 'add' };
	dispatchKey(harness.contentEl, keyEvent('ArrowDown', { target: column }));
	assert.equal(harness.documentRef.activeElement, addColumn);

	column.focus();
	nextColumnNavigationTarget = { kind: 'column', id: 'later' };
	dispatchKey(harness.contentEl, keyEvent('ArrowDown', { target: column }));
	assert.equal(harness.store.state.actions.at(-1).type, 'SELECT_COLUMN');
	assert.equal(harness.store.state.actions.at(-1).payload.columnId, 'later');
	harness.flushAnimationFrames();

	taskNavigationItems = [firstTask, secondTask];
	firstTask.focus();
	dispatchKey(harness.contentEl, keyEvent('ArrowDown', { target: firstTask }));
	assert.equal(harness.documentRef.activeElement, secondTask);
	assert.deepEqual(secondTask.scrollCalls, [{ block: 'nearest' }]);
});

test('editing inputs keep native arrow behavior while empty task creation can navigate', async () => {
	const harness = createHarness();
	await harness.view.onOpen();
	const taskPane = child(harness.contentEl, 'aulyckanban-task-pane');
	const editingInput = taskPane.append(
		new MockTextAreaElement(harness.documentRef, {
			cls: 'aulyckanban-edit-textarea',
			value: '正在编辑',
		}),
	);
	const firstTask = child(taskPane, 'aulyckanban-task');
	const secondTask = child(taskPane, 'aulyckanban-task');
	taskNavigationItems = [firstTask, secondTask];

	editingInput.focus();
	const nativeArrow = keyEvent('ArrowDown', { target: editingInput });
	dispatchKey(harness.contentEl, nativeArrow);
	assert.equal(nativeArrow.defaultPrevented, false);
	assert.equal(harness.documentRef.activeElement, editingInput);

	const emptyCreateInput = taskPane.append(
		new MockTextAreaElement(harness.documentRef, {
			cls: 'aulyckanban-task-create-input',
			value: '   ',
		}),
	);
	taskNavigationItems = [emptyCreateInput, firstTask];
	emptyCreateInput.focus();
	const navigationArrow = keyEvent('ArrowDown', { target: emptyCreateInput });
	dispatchKey(harness.contentEl, navigationArrow);
	assert.equal(navigationArrow.defaultPrevented, true);
	assert.equal(harness.documentRef.activeElement, firstTask);
});

test('reverse arrows and shared task controls navigate in the expected direction', async () => {
	const harness = createHarness();
	await harness.view.onOpen();
	const utility = child(harness.contentEl, 'aulyckanban-utility-bar');
	const search = child(utility, 'aulyckanban-task-search-input');
	const archive = child(utility, 'aulyckanban-archive-btn');
	const toolbar = child(harness.contentEl, 'aulyckanban-toolbar');
	const viewTab = child(toolbar, 'aulyckanban-view-tab aulyckanban-tab-active', {
		viewId: 'work',
	});
	const columnNav = child(harness.contentEl, 'aulyckanban-category-nav');
	const column = child(columnNav, 'aulyckanban-nav-item aulyckanban-nav-item-active', {
		columnId: 'base',
	});
	const taskPane = child(harness.contentEl, 'aulyckanban-task-pane');
	const firstTask = child(taskPane, 'aulyckanban-task');
	const secondTask = child(taskPane, 'aulyckanban-task');

	viewTab.focus();
	nextViewNavigationTarget = { kind: 'view', id: 'personal' };
	const viewArrow = keyEvent('ArrowLeft', { target: viewTab });
	dispatchKey(harness.contentEl, viewArrow);
	assert.equal(viewArrow.defaultPrevented, true);
	assert.equal(viewNavigationCalls.at(-1)[3], -1);
	assert.deepEqual(harness.store.state.actions.at(-1), {
		type: 'SWITCH_VIEW',
		payload: { view: 'personal' },
	});

	column.focus();
	nextColumnNavigationTarget = { kind: 'column', id: 'later' };
	const columnArrow = keyEvent('ArrowUp', { target: column });
	dispatchKey(harness.contentEl, columnArrow);
	assert.equal(columnArrow.defaultPrevented, true);
	assert.equal(columnNavigationCalls.at(-1)[3], -1);
	assert.deepEqual(harness.store.state.actions.at(-1), {
		type: 'SELECT_COLUMN',
		payload: { columnId: 'later' },
	});

	taskNavigationItems = [firstTask, secondTask];
	secondTask.focus();
	const taskArrow = keyEvent('ArrowUp', { target: secondTask });
	dispatchKey(harness.contentEl, taskArrow);
	assert.equal(taskArrow.defaultPrevented, true);
	assert.equal(harness.documentRef.activeElement, firstTask);

	utilityNavigationItems = [search, archive];
	search.value = '正在输入';
	search.focus();
	const searchCaretArrow = keyEvent('ArrowLeft', { target: search });
	dispatchKey(harness.contentEl, searchCaretArrow);
	assert.equal(searchCaretArrow.defaultPrevented, false);
	assert.equal(harness.documentRef.activeElement, search);
	const composingArrow = keyEvent('ArrowRight', { target: search, isComposing: true });
	dispatchKey(harness.contentEl, composingArrow);
	assert.equal(composingArrow.defaultPrevented, false);
	assert.equal(harness.documentRef.activeElement, search);

	search.value = '';
	const verticalArrow = keyEvent('ArrowDown', { target: search });
	dispatchKey(harness.contentEl, verticalArrow);
	assert.equal(verticalArrow.defaultPrevented, false);
	assert.equal(harness.documentRef.activeElement, search);

	const searchArrow = keyEvent('ArrowRight', { target: search });
	dispatchKey(harness.contentEl, searchArrow);
	assert.equal(searchArrow.defaultPrevented, true);
	assert.equal(harness.documentRef.activeElement, archive);
	const archiveArrow = keyEvent('ArrowLeft', { target: archive });
	dispatchKey(harness.contentEl, archiveArrow);
	assert.equal(archiveArrow.defaultPrevented, true);
	assert.equal(harness.documentRef.activeElement, search);
});

test('Tab handles document-level, missing-focus, selector-fallback, and editing-blur paths', async () => {
	const harness = createHarness();
	await harness.view.onOpen();
	const utility = child(harness.contentEl, 'aulyckanban-utility-bar');
	child(utility, 'aulyckanban-task-search-input');
	const toolbar = child(harness.contentEl, 'aulyckanban-toolbar');
	child(toolbar, 'aulyckanban-view-tab', { viewId: 'work' });
	const taskPane = child(harness.contentEl, 'aulyckanban-task-pane');
	const task = child(taskPane, 'aulyckanban-task');
	const columnNav = child(harness.contentEl, 'aulyckanban-category-nav');
	const plainColumn = child(columnNav, 'aulyckanban-nav-item', { columnId: 'base' });
	const archive = child(utility, 'aulyckanban-archive-btn');
	utilityFocusTarget = archive;
	taskFocusTarget = task;

	harness.documentRef.activeElement = harness.documentRef.documentElement;
	const documentTab = keyEvent('Tab', {
		target: harness.documentRef.documentElement,
		path: [],
	});
	dispatchKey(harness.windowRef, documentTab);
	assert.equal(documentTab.defaultPrevented, true);
	assert.equal(harness.documentRef.activeElement, archive);

	const unzoned = child(harness.contentEl, 'aulyckanban-unzoned-control');
	unzoned.focus();
	const unzonedTab = keyEvent('Tab', { target: unzoned, path: [unzoned, harness.contentEl] });
	dispatchKey(harness.contentEl, unzonedTab);
	assert.equal(unzonedTab.defaultPrevented, true);
	assert.equal(harness.documentRef.activeElement, archive);

	harness.documentRef.activeElement = {};
	const missingFocusTab = keyEvent('Tab', {
		target: harness.documentRef.documentElement,
		path: [],
	});
	dispatchKey(harness.windowRef, missingFocusTab);
	assert.equal(missingFocusTab.defaultPrevented, true);
	assert.equal(harness.documentRef.activeElement, archive);

	const editingInput = taskPane.append(
		new MockTextAreaElement(harness.documentRef, {
			cls: 'aulyckanban-edit-textarea',
			value: '编辑中',
		}),
	);
	editingInput.focus();
	const editingTab = keyEvent('Tab', {
		target: editingInput,
		path: [editingInput, taskPane, harness.contentEl],
	});
	dispatchKey(harness.contentEl, editingTab);
	assert.equal(editingInput.blurCount, 1);
	assert.equal(harness.documentRef.activeElement, null);
	assert.equal(harness.getAnimationFrameCount(), 1);
	harness.flushAnimationFrames();
	assert.equal(harness.documentRef.activeElement, plainColumn);
});

test('view navigation recognizes the retained add control and avoids redundant selections', async () => {
	const harness = createHarness();
	await harness.view.onOpen();
	const toolbar = child(harness.contentEl, 'aulyckanban-toolbar');
	const allTasks = child(toolbar, 'aulyckanban-all-tasks-btn');
	const viewTab = child(toolbar, 'aulyckanban-view-tab aulyckanban-tab-active', {
		viewId: 'work',
	});
	const addView = child(toolbar, 'aulyckanban-view-add-btn');

	addView.focus();
	nextViewNavigationTarget = { kind: 'view', id: 'work' };
	dispatchKey(harness.contentEl, keyEvent('ArrowRight', { target: addView }));
	assert.deepEqual(viewNavigationCalls.at(-1)[4], { kind: 'add' });
	harness.flushAnimationFrames();
	assert.equal(harness.documentRef.activeElement, viewTab);

	viewTab.focus();
	const actionCount = harness.store.state.actions.length;
	nextViewNavigationTarget = null;
	dispatchKey(harness.contentEl, keyEvent('ArrowRight', { target: viewTab }));
	assert.equal(harness.store.state.actions.length, actionCount);
	assert.equal(harness.documentRef.activeElement, viewTab);

	nextViewNavigationTarget = { kind: 'view', id: 'work' };
	dispatchKey(harness.contentEl, keyEvent('ArrowRight', { target: viewTab }));
	assert.deepEqual(viewNavigationCalls.at(-1)[4], { kind: 'view', id: 'work' });
	assert.equal(harness.store.state.actions.length, actionCount);

	viewTab.focus();
	nextViewNavigationTarget = { kind: 'all' };
	dispatchKey(harness.contentEl, keyEvent('ArrowLeft', { target: viewTab }));
	assert.equal(harness.store.state.actions.at(-1).type, 'SHOW_ALL_TASKS');
	harness.flushAnimationFrames();
	assert.equal(harness.documentRef.activeElement, allTasks);

	harness.store.state.taskScope = 'archive';
	nextViewNavigationTarget = { kind: 'view', id: 'work' };
	dispatchKey(harness.contentEl, keyEvent('ArrowRight', { target: viewTab }));
	assert.equal(harness.store.state.actions.at(-1).type, 'SWITCH_VIEW');
	assert.equal(harness.store.state.taskScope, 'current');
});

test('column navigation includes all quadrants, existing quadrants, and the retained add control', async () => {
	const harness = createHarness();
	await harness.view.onOpen();
	const columnNav = child(harness.contentEl, 'aulyckanban-category-nav');
	const allColumns = child(columnNav, 'aulyckanban-nav-item aulyckanban-nav-all-btn');
	const column = child(columnNav, 'aulyckanban-nav-item aulyckanban-nav-item-active', {
		columnId: 'base',
	});
	const addColumn = child(columnNav, 'aulyckanban-nav-add-btn');

	addColumn.focus();
	nextColumnNavigationTarget = { kind: 'column', id: 'base' };
	dispatchKey(harness.contentEl, keyEvent('ArrowDown', { target: addColumn }));
	assert.deepEqual(columnNavigationCalls.at(-1)[4], { kind: 'add' });
	harness.flushAnimationFrames();
	assert.equal(harness.documentRef.activeElement, column);

	column.focus();
	nextColumnNavigationTarget = { kind: 'all' };
	dispatchKey(harness.contentEl, keyEvent('ArrowUp', { target: column }));
	assert.equal(harness.store.state.actions.at(-1).type, 'SHOW_ALL_COLUMNS');
	harness.flushAnimationFrames();
	assert.equal(harness.documentRef.activeElement, allColumns);

	column.focus();
	harness.store.state.columnScope = 'current';
	let actionCount = harness.store.state.actions.length;
	nextColumnNavigationTarget = null;
	dispatchKey(harness.contentEl, keyEvent('ArrowDown', { target: column }));
	assert.equal(harness.store.state.actions.length, actionCount);

	nextColumnNavigationTarget = { kind: 'column', id: 'base' };
	dispatchKey(harness.contentEl, keyEvent('ArrowDown', { target: column }));
	assert.equal(harness.store.state.actions.length, actionCount);

	harness.store.state.columnScope = 'all';
	dispatchKey(harness.contentEl, keyEvent('ArrowDown', { target: column }));
	assert.equal(harness.store.state.actions.at(-1).type, 'SELECT_COLUMN');
	assert.equal(harness.store.state.columnScope, 'current');
});
