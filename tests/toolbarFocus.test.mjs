import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

class MockElement {
	constructor(tagName, options, documentRef) {
		this.tagName = tagName;
		this.documentRef = documentRef;
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
		this.classList = {
			contains: (value) => this.classes.has(value),
		};
	}

	append(child) {
		child.parentElement = this;
		this.children.push(child);
		return child;
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

	toggleClass(value, enabled) {
		if (enabled) this.classes.add(value);
		else this.classes.delete(value);
	}

	addEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push(listener);
		this.listeners.set(name, listeners);
	}

	focus() {
		this.documentRef.activeElement = this;
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

function createToolbarHarness() {
	const documentRef = { activeElement: null };
	globalThis.document = documentRef;
	globalThis.HTMLElement = MockElement;
	globalThis.requestAnimationFrame = (callback) => callback();

	const store = {
		currentView: 'work',
		taskScope: 'current',
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
			return this.taskScope === 'all';
		},
		getTaskViews: () => [
			{ id: 'work', title: 'Work' },
			{ id: 'test', title: 'Test' },
		],
		dispatch(action) {
			this.actions.push(action);
			if (action.type === 'SHOW_ALL_TASKS') this.taskScope = 'all';
		},
	};
	const parent = new MockElement('div', {}, documentRef);
	const toolbar = new Toolbar(parent, {}, store);
	return { documentRef, parent, store, toolbar };
}

test('task type controls stay out of the native Tab order', () => {
	const { parent } = createToolbarHarness();
	const buttons = descendants(parent).filter((element) => element.tagName === 'button');
	assert.equal(buttons.length, 3);
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
		1,
	);
});

test('task type toolbar contains only existing task types and the retained add control', () => {
	const { parent } = createToolbarHarness();
	assert.equal(
		descendants(parent).some((element) => element.classList.contains('aulyckanban-all-tasks-btn')),
		false,
	);
	assert.equal(
		descendants(parent).some((element) => element.classList.contains('aulyckanban-archive-btn')),
		false,
	);
	assert.equal(
		descendants(parent).filter((element) => element.classList.contains('aulyckanban-view-tab'))
			.length,
		2,
	);
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

test('task type focus does not create a second board-level focus state', () => {
	assert.doesNotMatch(source, /aulyckanban-(?:view-add-focused|toolbar-editing)/);
});

test('task type tabs expose rename and delete management actions', () => {
	assert.match(source, /addEventListener\('contextmenu'/);
	assert.match(source, /t\('view\.rename'\)/);
	assert.match(source, /t\('view\.delete'\)/);
	assert.match(source, /type: 'RENAME_VIEW'/);
	assert.match(source, /type: 'DELETE_VIEW'/);
});
