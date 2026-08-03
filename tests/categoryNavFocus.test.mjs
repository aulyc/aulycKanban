import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

class MockElement {
	constructor(options = {}) {
		this.ownerDocument = options.ownerDocument ?? { activeElement: null, defaultView: {} };
		this.ownerDocument.defaultView.HTMLElement = MockElement;
		this.ownerDocument.defaultView.requestAnimationFrame ??= (callback) => callback();
		this.doc = this.ownerDocument;
		this.win = this.ownerDocument.defaultView;
		this.children = [];
		this.dataset = {};
		this.attributes = { ...(options.attr ?? {}) };
		this.classes = new Set(
			String(options.cls ?? '')
				.split(/\s+/)
				.filter(Boolean),
		);
		this.textContent = options.text ?? '';
		this.listeners = new Map();
		this.classList = { contains: (value) => this.classes.has(value) };
	}

	createDiv(options = {}) {
		const child = new MockElement({ ...options, ownerDocument: this.ownerDocument });
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	createSpan(options = {}) {
		return this.createDiv(options);
	}

	empty() {
		this.children = [];
	}

	addClass(value) {
		this.classes.add(value);
	}

	toggleClass(value, enabled) {
		if (enabled) this.classes.add(value);
		else this.classes.delete(value);
	}

	setText(value) {
		this.textContent = value;
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
	}

	removeAttribute(name) {
		delete this.attributes[name];
	}

	addEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push(listener);
		this.listeners.set(name, listeners);
	}

	focus() {
		this.ownerDocument.activeElement = this;
		for (const listener of this.listeners.get('focus') ?? []) listener();
	}

	blur() {
		if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null;
		for (const listener of this.listeners.get('blur') ?? []) listener();
	}

	querySelectorAll(selector) {
		if (selector !== '.aulyckanban-nav-item') return [];
		return descendants(this).filter((element) =>
			element.classList.contains('aulyckanban-nav-item'),
		);
	}

	querySelector() {
		return null;
	}
}

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}

const source = readFileSync(new URL('../src/ui/CategoryNav.ts', import.meta.url), 'utf8');
const { CategoryNav } = await loadSourceModule(
	new URL('../src/ui/CategoryNav.ts', import.meta.url),
	{
		label: 'category-nav',
		mocks: {
			obsidian: { Menu: class {} },
			'../i18n': {
				t: (key) =>
					({ 'column.all': '全部象限', 'column.addPrompt': '输入新象限名称' })[key] ?? key,
			},
			'./ConfirmModal': { ConfirmModal: class {} },
			'./InlineInput': {
				createInlineInput: (parent, options) => parent.createDiv({ cls: options.cls }),
			},
			'../utils/dom': {
				appendAccessibleLabel: (element, text) =>
					element.createSpan({
						cls: 'aulyckanban-accessible-label',
						text,
					}),
			},
		},
	},
);

function createCategoryNavHarness(overrides = {}) {
	const store = {
		actions: [],
		getCurrentColumns: () => [
			{ id: 'last', title: '多少啊', tasks: [] },
			{ id: 'later', title: '稍后', tasks: [] },
		],
		getActiveColumnId: () => 'last',
		isShowingArchive: () => false,
		isShowingAllColumns: () => false,
		getTaskCountForColumn: () => 2,
		getVisibleTaskCount: () => 2,
		getArchiveTaskCount: () => 0,
		dispatch(action) {
			this.actions.push(action);
		},
		...overrides,
	};
	const parent = new MockElement();
	const categoryNav = new CategoryNav(parent, {}, store);
	return { categoryNav, parent, store };
}

test('all quadrants is a fixed first navigation control with the aggregate count', () => {
	const { parent, store } = createCategoryNavHarness();
	const nav = parent.children[0];
	const allButton = descendants(nav).find((element) =>
		element.classList.contains('aulyckanban-nav-all-btn'),
	);
	const quadrant = descendants(nav).find((element) => element.dataset.columnId === 'last');
	const addButton = descendants(nav).find((element) =>
		element.classList.contains('aulyckanban-nav-add-btn'),
	);
	assert.ok(allButton);
	assert.equal(nav.children[0], allButton);
	assert.equal(allButton.children[0].textContent, '全部象限');
	assert.equal(allButton.children[1].textContent, '2');
	assert.ok(quadrant);
	assert.ok(addButton);
	assert.equal(quadrant.children[1].textContent, '2');

	allButton.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });
	assert.equal(store.actions.at(-1).type, 'SHOW_ALL_COLUMNS');
});

test('all quadrants remains available and owns the active state in archive aggregate scope', () => {
	const { parent } = createCategoryNavHarness({
		isShowingArchive: () => true,
		isShowingAllColumns: () => true,
		getVisibleTaskCount: () => 5,
	});
	const nav = parent.children[0];
	const activeItems = descendants(nav).filter((element) =>
		element.classList.contains('aulyckanban-nav-item-active'),
	);
	assert.equal(activeItems.length, 1);
	assert.equal(activeItems[0].classList.contains('aulyckanban-nav-all-btn'), true);
	assert.equal(activeItems[0].children[1].textContent, '5');
});

test('clicking a quadrant restores focus to the selected item after the store rerender', () => {
	let activeColumnId = 'last';
	const { categoryNav, parent, store } = createCategoryNavHarness({
		getActiveColumnId: () => activeColumnId,
		dispatch(action) {
			this.actions.push(action);
			if (action.type === 'SELECT_COLUMN') activeColumnId = action.payload.columnId;
		},
	});
	const initialTarget = descendants(parent).find((element) => element.dataset.columnId === 'later');

	initialTarget.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });
	categoryNav.render();

	const renderedTarget = descendants(parent).find(
		(element) => element.dataset.columnId === 'later',
	);
	assert.equal(store.actions.at(-1).type, 'SELECT_COLUMN');
	assert.equal(renderedTarget.classList.contains('aulyckanban-nav-item-active'), true);
	assert.equal(parent.ownerDocument.activeElement, renderedTarget);
});

test('renaming an existing quadrant replaces only that item with an inline editor', () => {
	const { categoryNav, parent } = createCategoryNavHarness();
	const item = descendants(parent).find((element) => element.dataset.columnId === 'last');
	categoryNav.startInlineRename('last', item);
	const editingItem = descendants(parent).find((element) => element.dataset.columnId === 'last');
	assert.equal(editingItem.classList.contains('aulyckanban-nav-item-editing'), true);
	assert.equal(
		descendants(editingItem).some((element) =>
			element.classList.contains('aulyckanban-nav-inline-input'),
		),
		true,
	);
});

test('category add control has an accessible name without tooltip attributes', () => {
	const { parent } = createCategoryNavHarness();
	const nav = parent.children[0];
	const initialAddButton = descendants(nav).find((element) =>
		element.classList.contains('aulyckanban-nav-add-btn'),
	);
	assert.equal(initialAddButton.attributes['aria-label'], undefined);
	assert.equal(initialAddButton.attributes.title, undefined);
	const accessibleLabel = descendants(initialAddButton).find((element) =>
		element.classList.contains('aulyckanban-accessible-label'),
	);
	assert.equal(accessibleLabel.textContent, '输入新象限名称');

	const keydown = initialAddButton.listeners.get('keydown')[0];
	keydown({ key: 'Enter', preventDefault() {}, stopPropagation() {} });

	const editingAddContainer = descendants(nav).find((element) =>
		element.classList.contains('aulyckanban-nav-add-btn'),
	);
	assert.equal(editingAddContainer.attributes['aria-label'], undefined);
	assert.equal(editingAddContainer.attributes.role, undefined);
	assert.equal(
		editingAddContainer.children[0].classList.contains('aulyckanban-nav-inline-input'),
		true,
	);
});

test('transient editor focus suppresses only the visual selection through a scoped state class', () => {
	const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
	assert.match(
		css,
		/\.aulyckanban-category-nav\.aulyckanban-add-control-focused\s+\.aulyckanban-nav-item-active/,
	);
	assert.match(source, /aulyckanban-add-control-focused/);
});

test('quadrant add focus toggles the scoped visual state class', () => {
	const { parent } = createCategoryNavHarness();
	const nav = parent.children[0];
	const addButton = descendants(nav).find((element) =>
		element.classList.contains('aulyckanban-nav-add-btn'),
	);

	addButton.focus();
	assert.equal(nav.classList.contains('aulyckanban-add-control-focused'), true);
	addButton.blur();
	assert.equal(nav.classList.contains('aulyckanban-add-control-focused'), false);
});

test('inline quadrant input uses the same one-pixel accent border as task editing', () => {
	const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
	const inputRule =
		css.match(/\.aulyckanban-kanban-container \.aulyckanban-nav-inline-input\s*\{([^}]*)\}/)?.[1] ??
		'';
	const inputFocusRule =
		css.match(
			/\.aulyckanban-kanban-container \.aulyckanban-nav-inline-input:focus\s*\{([^}]*)\}/,
		)?.[1] ?? '';
	const taskRule = css.match(/\.aulyckanban-task\s*\{([^}]*)\}/)?.[1] ?? '';

	assert.match(inputRule, /border:\s*1px solid var\(--interactive-accent\)/);
	assert.match(inputRule, /box-shadow:\s*none/);
	assert.match(inputFocusRule, /box-shadow:\s*none/);
	assert.match(taskRule, /border:\s*1px solid/);
});
