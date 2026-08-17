import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

class MockElement {
	constructor(tagName, options, documentRef) {
		this.tagName = tagName;
		this.documentRef = documentRef;
		this.ownerDocument = documentRef;
		this.parentElement = null;
		this.children = [];
		this.dataset = {};
		this.attributes = { ...(options?.attr ?? {}) };
		this.classes = new Set(
			String(options?.cls ?? '')
				.split(/\s+/)
				.filter(Boolean),
		);
		this.textContent = options?.text ?? '';
		this.listeners = new Map();
		this.style = {
			values: {},
			setProperty: (name, value) => {
				this.style.values[name] = value;
			},
		};
		this.classList = {
			contains: (value) => this.classes.has(value),
		};
		this.doc = documentRef;
		this.win = documentRef.defaultView;
	}

	append(child) {
		return this.appendChild(child);
	}

	appendChild(child) {
		child.remove();
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	insertBefore(child, reference) {
		child.remove();
		child.parentElement = this;
		const index = reference ? this.children.indexOf(reference) : -1;
		if (index < 0) this.children.push(child);
		else this.children.splice(index, 0, child);
		return child;
	}

	get nextSibling() {
		if (!this.parentElement) return null;
		const index = this.parentElement.children.indexOf(this);
		return this.parentElement.children[index + 1] ?? null;
	}

	remove() {
		if (!this.parentElement) return;
		const index = this.parentElement.children.indexOf(this);
		if (index >= 0) this.parentElement.children.splice(index, 1);
		this.parentElement = null;
	}

	createDiv(options = {}) {
		return this.append(new MockElement('div', options, this.documentRef));
	}

	createSpan(options = {}) {
		return this.createEl('span', options);
	}

	createEl(tagName, options = {}) {
		return this.append(new MockElement(tagName, options, this.documentRef));
	}

	empty() {
		if (this.documentRef.activeElement && this.contains(this.documentRef.activeElement)) {
			this.documentRef.activeElement = null;
		}
		this.children = [];
	}

	contains(element) {
		for (let current = element; current; current = current.parentElement) {
			if (current === this) return true;
		}
		return false;
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
	}

	getBoundingClientRect() {
		return { left: 0, top: 0, width: 100, height: 30, right: 100, bottom: 30 };
	}

	toggleClass(value, enabled) {
		if (enabled) this.classes.add(value);
		else this.classes.delete(value);
	}

	addClass(value) {
		this.classes.add(value);
	}

	removeClass(value) {
		this.classes.delete(value);
	}

	querySelectorAll(selector) {
		if (selector !== '.aulyckanban-view-tab') return [];
		return descendants(this).filter((element) =>
			element.classList.contains('aulyckanban-view-tab'),
		);
	}

	addEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push(listener);
		this.listeners.set(name, listeners);
	}

	focus() {
		this.documentRef.activeElement = this;
		for (const listener of this.listeners.get('focus') ?? []) listener();
	}

	blur() {
		if (this.documentRef.activeElement === this) this.documentRef.activeElement = null;
		for (const listener of this.listeners.get('blur') ?? []) listener();
	}
}

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}

const source = readFileSync(new URL('../src/ui/Toolbar.ts', import.meta.url), 'utf8');
const { Toolbar } = await loadSourceModule(new URL('../src/ui/Toolbar.ts', import.meta.url), {
	label: 'toolbar',
	mocks: {
		'../i18n': { t: (key) => key },
		'./InlineInput': {
			createInlineInput: (parent, options) => parent.createEl('input', { cls: options.cls }),
		},
		'./ConfirmModal': { ConfirmModal: class {} },
		'../utils/focusCycle': { revealTaskTypeItem: () => {} },
		'../utils/dom': {
			appendAccessibleLabel: (element, text) =>
				element.createSpan({
					cls: 'aulyckanban-accessible-label',
					text,
				}),
		},
		obsidian: { Menu: class {}, setIcon: () => {} },
	},
});

function createToolbarHarness(drag, overrides = {}) {
	const documentRef = { activeElement: null, defaultView: {} };
	documentRef.defaultView.HTMLElement = MockElement;
	documentRef.defaultView.Node = MockElement;
	documentRef.defaultView.MouseEvent = class {
		constructor(type, options) {
			this.type = type;
			Object.assign(this, options);
		}
	};
	documentRef.defaultView.requestAnimationFrame = (callback) => callback();
	documentRef.defaultView.setTimeout = (callback) => {
		callback();
		return 1;
	};
	documentRef.defaultView.clearTimeout = () => {};
	documentRef.body = new MockElement('body', {}, documentRef);
	globalThis.document = documentRef;
	globalThis.HTMLElement = MockElement;

	const store = {
		currentView: 'work',
		taskScope: 'current',
		archiveTaskTypeScope: 'current',
		actions: [],
		getCurrentView() {
			return this.currentView;
		},
		getTaskScope() {
			return this.taskScope;
		},
		isShowingArchive() {
			return this.taskScope === 'archive';
		},
		isShowingAllTasks() {
			return this.taskScope === 'archive'
				? this.archiveTaskTypeScope === 'all'
				: this.taskScope === 'all';
		},
		getTaskViews: () => [
			{ id: 'work', title: 'Work' },
			{ id: 'test', title: 'Test' },
		],
		dispatch(action) {
			this.actions.push(action);
			if (action.type === 'SHOW_ALL_TASKS') {
				this.taskScope = 'all';
				this.archiveTaskTypeScope = 'all';
			}
		},
		...overrides,
	};
	const parent = new MockElement('div', {}, documentRef);
	const toolbar = new Toolbar(parent, {}, store, drag);
	return { documentRef, parent, store, toolbar };
}

test('dragging onto a task type locks it and drops to that exact type', () => {
	const calls = [];
	const drag = {
		isDragging: true,
		lockedViewId: null,
		subscribe: () => () => {},
		lockView: (viewId) => calls.push(['lock', viewId]),
		drop: (target) => calls.push(['drop', target]),
	};
	const { parent } = createToolbarHarness(drag);
	const target = descendants(parent).find((element) => element.dataset.viewId === 'test');
	let prevented = 0;
	target.listeners.get('dragenter')[0]({ preventDefault: () => prevented++ });
	target.listeners.get('drop')[0]({
		preventDefault: () => prevented++,
		stopPropagation() {},
	});
	assert.equal(target.classList.contains('aulyckanban-drop-zone'), true);
	assert.equal(prevented, 2);
	assert.deepEqual(calls, [
		['lock', 'test'],
		['drop', { targetViewId: 'test' }],
	]);
});

test('task types drag horizontally to persist a new order without starting a task drop', () => {
	const { parent, store } = createToolbarHarness();
	const sourceButton = descendants(parent).find((element) => element.dataset.viewId === 'work');
	const targetButton = descendants(parent).find((element) => element.dataset.viewId === 'test');
	const dataTransfer = {
		setData(type, value) {
			this.value = [type, value];
		},
		setDragImage(element, x, y) {
			this.dragImage = { element, x, y };
		},
	};
	sourceButton.listeners.get('dragstart')[0]({ dataTransfer });
	assert.equal(sourceButton.draggable, true);
	assert.equal(sourceButton.classList.contains('aulyckanban-reorder-dragging'), true);
	assert.deepEqual(dataTransfer.value, ['application/x-aulyckanban-view-order', 'work']);
	assert.equal(
		dataTransfer.dragImage.element.classList.contains('aulyckanban-reorder-drag-preview'),
		true,
	);
	assert.equal(dataTransfer.dragImage.element.textContent, 'Work');
	assert.deepEqual([dataTransfer.dragImage.x, dataTransfer.dragImage.y], [18, 30]);
	let prevented = 0;
	for (const listener of targetButton.listeners.get('dragover')) {
		listener({ clientX: 90, dataTransfer, preventDefault: () => prevented++ });
	}
	const placeholder = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-reorder-placeholder-horizontal'),
	);
	assert.ok(placeholder);
	assert.equal(placeholder.style.values['--aulyckanban-reorder-placeholder-size'], '100px');
	assert.equal(placeholder.parentElement.children.at(-1), placeholder);
	for (const listener of placeholder.listeners.get('drop')) {
		listener({
			preventDefault: () => prevented++,
			stopPropagation() {},
		});
	}
	assert.equal(prevented, 2);
	assert.deepEqual(store.actions.at(-1), {
		type: 'REORDER_VIEWS',
		payload: { viewIds: ['test', 'work'] },
	});
	assert.equal(
		descendants(parent).some((element) =>
			element.classList.contains('aulyckanban-reorder-placeholder-horizontal'),
		),
		false,
	);
});

test('task type reorder hides the placeholder for an adjacent no-op slot', () => {
	const { parent, store } = createToolbarHarness();
	const sourceButton = descendants(parent).find((element) => element.dataset.viewId === 'work');
	const targetButton = descendants(parent).find((element) => element.dataset.viewId === 'test');
	const dataTransfer = { setData() {}, setDragImage() {} };
	sourceButton.listeners.get('dragstart')[0]({ dataTransfer });
	for (const listener of targetButton.listeners.get('dragover')) {
		listener({ clientX: 90, dataTransfer, preventDefault() {} });
	}
	assert.equal(
		descendants(parent).some((element) =>
			element.classList.contains('aulyckanban-reorder-placeholder-horizontal'),
		),
		true,
	);
	for (const listener of targetButton.listeners.get('dragover')) {
		listener({ clientX: 10, dataTransfer, preventDefault() {} });
	}
	assert.equal(
		descendants(parent).some((element) =>
			element.classList.contains('aulyckanban-reorder-placeholder-horizontal'),
		),
		false,
	);
	targetButton.listeners.get('drop')[0]({
		clientX: 10,
		preventDefault() {},
		stopPropagation() {},
	});
	assert.deepEqual(store.actions, []);
});

test('task type reorder keeps one stable placeholder across the same insertion slot', () => {
	const { parent } = createToolbarHarness(undefined, {
		getTaskViews: () => [
			{ id: 'work', title: 'Work' },
			{ id: 'test', title: 'Test' },
			{ id: 'future', title: 'Future' },
		],
	});
	const sourceButton = descendants(parent).find((element) => element.dataset.viewId === 'work');
	const firstTarget = descendants(parent).find((element) => element.dataset.viewId === 'test');
	const nextTarget = descendants(parent).find((element) => element.dataset.viewId === 'future');
	const dataTransfer = { setData() {}, setDragImage() {} };
	sourceButton.listeners.get('dragstart')[0]({ dataTransfer });
	for (const listener of firstTarget.listeners.get('dragover')) {
		listener({ clientX: 90, dataTransfer, preventDefault() {} });
	}
	const placeholder = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-reorder-placeholder-horizontal'),
	);
	assert.ok(placeholder);

	for (const listener of firstTarget.listeners.get('dragleave')) {
		listener({ relatedTarget: null });
	}
	for (const listener of nextTarget.listeners.get('dragover')) {
		listener({ clientX: 10, dataTransfer, preventDefault() {} });
	}

	const placeholders = descendants(parent).filter((element) =>
		element.classList.contains('aulyckanban-reorder-placeholder-horizontal'),
	);
	assert.deepEqual(placeholders, [placeholder]);
	assert.equal(placeholder.nextSibling, nextTarget);
});

test('task type controls stay out of the native Tab order', () => {
	const { parent } = createToolbarHarness();
	const buttons = descendants(parent).filter((element) => element.tagName === 'button');
	assert.equal(buttons.length, 4);
	assert.equal(
		buttons.every((button) => button.attributes.tabindex === '-1'),
		true,
	);
});

test('toolbar icon controls use hidden accessible text without tooltip attributes', () => {
	const { parent } = createToolbarHarness();
	const buttons = descendants(parent).filter((element) => element.tagName === 'button');
	assert.equal(
		buttons.every((button) => button.attributes['aria-label'] === undefined),
		true,
	);
	assert.equal(
		buttons.every((button) => button.attributes.title === undefined),
		true,
	);
	assert.equal(
		descendants(parent).filter((element) =>
			element.classList.contains('aulyckanban-accessible-label'),
		).length,
		2,
	);
});

test('task type toolbar restores all tasks while keeping archive in the utility row', () => {
	const { parent, store } = createToolbarHarness();
	const allButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-all-tasks-btn'),
	);
	assert.ok(allButton);
	assert.equal(allButton.parentElement.classList.contains('aulyckanban-all-tasks-slot'), true);
	assert.equal(
		descendants(parent).some((element) => element.classList.contains('aulyckanban-archive-btn')),
		false,
	);
	assert.equal(
		descendants(parent).filter((element) => element.classList.contains('aulyckanban-view-tab'))
			.length,
		2,
	);
	allButton.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });
	assert.equal(store.actions.at(-1).type, 'SHOW_ALL_TASKS');
});

test('archive mode keeps its originating task type scope visibly selected', () => {
	const { parent, store, toolbar } = createToolbarHarness();
	store.taskScope = 'archive';
	toolbar.render();

	const currentView = descendants(parent).find(
		(element) => element.dataset.viewId === store.currentView,
	);
	const allButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-all-tasks-btn'),
	);
	assert.equal(currentView.classList.contains('aulyckanban-tab-active'), true);
	assert.equal(allButton.classList.contains('aulyckanban-tab-active'), false);

	store.archiveTaskTypeScope = 'all';
	toolbar.render();
	const activeAllButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-all-tasks-btn'),
	);
	assert.equal(activeAllButton.classList.contains('aulyckanban-tab-active'), true);

	activeAllButton.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });
	assert.equal(store.actions.at(-1).type, 'SHOW_ALL_TASKS');
});

test('task type add control stays fixed outside the scrollable task type strip', () => {
	const { parent } = createToolbarHarness();
	const viewStrip = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-view-strip'),
	);
	const addButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-view-add-btn'),
	);
	assert.ok(viewStrip);
	assert.ok(addButton);
	assert.equal(addButton.parentElement.classList.contains('aulyckanban-view-add-slot'), true);
	assert.notEqual(addButton.parentElement, viewStrip);
});

test('task type add control expands into the retained inline editor', () => {
	const { parent } = createToolbarHarness();
	const addButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-view-add-btn'),
	);
	addButton.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });
	assert.equal(
		descendants(parent).some((element) => element.classList.contains('aulyckanban-view-add-input')),
		true,
	);
});

test('clicking the retained task type exits a hidden aggregate scope even when its id did not change', () => {
	const { parent, store, toolbar } = createToolbarHarness();
	store.taskScope = 'all';
	toolbar.render();
	const retainedButton = descendants(parent).find(
		(element) => element.dataset.viewId === store.currentView,
	);

	retainedButton.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });
	assert.equal(store.actions.at(-1).type, 'SWITCH_VIEW');
	assert.equal(store.actions.at(-1).payload.view, store.currentView);
});

test('toolbar rerender moves an existing task type focus to the selected task type', () => {
	const { documentRef, parent, store, toolbar } = createToolbarHarness();
	const workButton = descendants(parent).find((element) => element.dataset.viewId === 'work');
	workButton.focus();

	store.currentView = 'test';
	toolbar.render();

	assert.equal(documentRef.activeElement.dataset.viewId, 'test');
	assert.equal(documentRef.activeElement.classList.contains('aulyckanban-tab-active'), true);
});

test('task type add focus uses one transient compatibility class instead of CSS :has', () => {
	assert.match(source, /aulyckanban-add-control-focused/);
	assert.doesNotMatch(source, /aulyckanban-(?:view-add-focused|toolbar-editing)/);
});

test('task type add focus toggles the scoped visual state class', () => {
	const { parent } = createToolbarHarness();
	const toolbarEl = parent.children[0];
	const addButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-view-add-btn'),
	);

	addButton.focus();
	assert.equal(toolbarEl.classList.contains('aulyckanban-add-control-focused'), true);
	addButton.blur();
	assert.equal(toolbarEl.classList.contains('aulyckanban-add-control-focused'), false);
});

test('task type tabs expose rename and delete management actions', () => {
	assert.match(source, /addEventListener\('contextmenu'/);
	assert.match(source, /t\('view\.rename'\)/);
	assert.match(source, /t\('view\.delete'\)/);
	assert.match(source, /type: 'RENAME_VIEW'/);
	assert.match(source, /type: 'DELETE_VIEW'/);
});
