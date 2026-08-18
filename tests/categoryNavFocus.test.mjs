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
		this.parentElement = null;
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
		this.style = {
			values: {},
			setProperty: (name, value) => {
				this.style.values[name] = value;
			},
		};
		this.classList = { contains: (value) => this.classes.has(value) };
	}

	createDiv(options = {}) {
		const child = new MockElement({ ...options, ownerDocument: this.ownerDocument });
		return this.appendChild(child);
	}

	createSpan(options = {}) {
		return this.createDiv(options);
	}

	empty() {
		for (const child of this.children) child.parentElement = null;
		this.children = [];
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

	contains(element) {
		for (let current = element; current; current = current.parentElement) {
			if (current === this) return true;
		}
		return false;
	}

	addClass(value) {
		this.classes.add(value);
	}

	toggleClass(value, enabled) {
		if (enabled) this.classes.add(value);
		else this.classes.delete(value);
	}

	removeClass(value) {
		this.classes.delete(value);
	}

	setText(value) {
		this.textContent = value;
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
	}

	getBoundingClientRect() {
		return { left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40 };
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
		if (selector === '.aulyckanban-nav-item') {
			return descendants(this).filter((element) =>
				element.classList.contains('aulyckanban-nav-item'),
			);
		}
		if (selector === '.aulyckanban-nav-item[data-column-id]') {
			return descendants(this).filter(
				(element) => element.classList.contains('aulyckanban-nav-item') && element.dataset.columnId,
			);
		}
		return [];
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

function createCategoryNavHarness(overrides = {}, drag) {
	const ownerDocument = { activeElement: null, defaultView: {} };
	ownerDocument.defaultView.HTMLElement = MockElement;
	ownerDocument.defaultView.Node = MockElement;
	ownerDocument.defaultView.requestAnimationFrame = (callback) => callback();
	ownerDocument.body = new MockElement({ ownerDocument });
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
	const parent = new MockElement({ ownerDocument });
	const categoryNav = new CategoryNav(parent, {}, store, drag);
	return { categoryNav, parent, store };
}

test('dragging onto a quadrant drops to that exact quadrant', () => {
	const drops = [];
	const drag = {
		isDragging: true,
		subscribe: () => () => {},
		drop: (target) => drops.push(target),
	};
	const { parent } = createCategoryNavHarness({}, drag);
	const target = descendants(parent).find((element) => element.dataset.columnId === 'later');
	let prevented = 0;
	const dataTransfer = {};
	target.listeners.get('dragover')[0]({
		preventDefault: () => prevented++,
		dataTransfer,
	});
	target.listeners.get('drop')[0]({
		preventDefault: () => prevented++,
		stopPropagation() {},
	});
	assert.equal(target.classList.contains('aulyckanban-drop-zone'), true);
	assert.equal(prevented, 2);
	assert.equal(dataTransfer.dropEffect, 'move');
	assert.deepEqual(drops, [{ targetColumnId: 'later' }]);
});

test('quadrants ignore drag events when no task drag session is active', () => {
	const drops = [];
	const drag = {
		isDragging: false,
		subscribe: () => () => {},
		drop: (target) => drops.push(target),
	};
	const { parent } = createCategoryNavHarness({}, drag);
	const target = descendants(parent).find((element) => element.dataset.columnId === 'later');
	let prevented = false;
	target.listeners.get('dragover')[0]({ preventDefault: () => (prevented = true) });
	target.listeners.get('drop')[0]({
		preventDefault: () => (prevented = true),
		stopPropagation() {},
	});
	assert.equal(prevented, false);
	assert.deepEqual(drops, []);
});

test('quadrants drag vertically to persist their shared order without moving tasks', () => {
	const { parent, store } = createCategoryNavHarness();
	const sourceItem = descendants(parent).find((element) => element.dataset.columnId === 'last');
	const targetItem = descendants(parent).find((element) => element.dataset.columnId === 'later');
	const dataTransfer = {
		setData(type, value) {
			this.value = [type, value];
		},
		setDragImage(element, x, y) {
			this.dragImage = { element, x, y };
		},
	};
	sourceItem.listeners.get('dragstart')[0]({ dataTransfer });
	assert.equal(sourceItem.draggable, true);
	assert.equal(sourceItem.classList.contains('aulyckanban-reorder-dragging'), true);
	assert.deepEqual(dataTransfer.value, ['application/x-aulyckanban-column-order', 'last']);
	assert.equal(
		dataTransfer.dragImage.element.classList.contains('aulyckanban-reorder-drag-preview'),
		true,
	);
	assert.equal(dataTransfer.dragImage.element.textContent, '多少啊');
	assert.deepEqual([dataTransfer.dragImage.x, dataTransfer.dragImage.y], [18, 30]);
	let prevented = 0;
	for (const listener of targetItem.listeners.get('dragover')) {
		listener({ clientY: 35, dataTransfer, preventDefault: () => prevented++ });
	}
	const placeholder = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-reorder-placeholder-vertical'),
	);
	assert.ok(placeholder);
	assert.equal(placeholder.style.values['--aulyckanban-reorder-placeholder-size'], '40px');
	assert.equal(placeholder.parentElement.children.at(-2), placeholder);
	for (const listener of placeholder.listeners.get('drop')) {
		listener({
			preventDefault: () => prevented++,
			stopPropagation() {},
		});
	}
	assert.equal(prevented, 2);
	assert.deepEqual(store.actions.at(-1), {
		type: 'REORDER_COLUMNS',
		payload: { columnIds: ['later', 'last'] },
	});
	assert.equal(
		descendants(parent).some((element) =>
			element.classList.contains('aulyckanban-reorder-placeholder-vertical'),
		),
		false,
	);
});

test('quadrant reorder hides the placeholder for an adjacent no-op slot', () => {
	const { parent, store } = createCategoryNavHarness();
	const sourceItem = descendants(parent).find((element) => element.dataset.columnId === 'last');
	const targetItem = descendants(parent).find((element) => element.dataset.columnId === 'later');
	const dataTransfer = { setData() {}, setDragImage() {} };
	sourceItem.listeners.get('dragstart')[0]({ dataTransfer });
	for (const listener of targetItem.listeners.get('dragover')) {
		listener({ clientY: 35, dataTransfer, preventDefault() {} });
	}
	assert.equal(
		descendants(parent).some((element) =>
			element.classList.contains('aulyckanban-reorder-placeholder-vertical'),
		),
		true,
	);
	for (const listener of targetItem.listeners.get('dragover')) {
		listener({ clientY: 5, dataTransfer, preventDefault() {} });
	}
	assert.equal(
		descendants(parent).some((element) =>
			element.classList.contains('aulyckanban-reorder-placeholder-vertical'),
		),
		false,
	);
	targetItem.listeners.get('drop')[0]({
		clientY: 5,
		preventDefault() {},
		stopPropagation() {},
	});
	assert.deepEqual(store.actions, []);
});

test('quadrant reorder keeps one stable placeholder across the same insertion slot', () => {
	const { parent } = createCategoryNavHarness({
		getCurrentColumns: () => [
			{ id: 'last', title: '多少啊', tasks: [] },
			{ id: 'later', title: '稍后', tasks: [] },
			{ id: 'future', title: '未来', tasks: [] },
		],
	});
	const sourceItem = descendants(parent).find((element) => element.dataset.columnId === 'last');
	const firstTarget = descendants(parent).find((element) => element.dataset.columnId === 'later');
	const nextTarget = descendants(parent).find((element) => element.dataset.columnId === 'future');
	const dataTransfer = { setData() {}, setDragImage() {} };
	sourceItem.listeners.get('dragstart')[0]({ dataTransfer });
	for (const listener of firstTarget.listeners.get('dragover')) {
		listener({ clientY: 35, dataTransfer, preventDefault() {} });
	}
	const placeholder = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-reorder-placeholder-vertical'),
	);
	assert.ok(placeholder);

	for (const listener of firstTarget.listeners.get('dragleave')) {
		listener({ relatedTarget: null });
	}
	for (const listener of nextTarget.listeners.get('dragover')) {
		listener({ clientY: 5, dataTransfer, preventDefault() {} });
	}

	const placeholders = descendants(parent).filter((element) =>
		element.classList.contains('aulyckanban-reorder-placeholder-vertical'),
	);
	assert.deepEqual(placeholders, [placeholder]);
	assert.equal(placeholder.nextSibling, nextTarget);
});

test('quadrant reorder ignores midpoint jitter before returning to the adjacent no-op slot', () => {
	const { parent } = createCategoryNavHarness();
	const sourceItem = descendants(parent).find((element) => element.dataset.columnId === 'last');
	const targetItem = descendants(parent).find((element) => element.dataset.columnId === 'later');
	const dataTransfer = { setData() {}, setDragImage() {} };
	sourceItem.listeners.get('dragstart')[0]({ dataTransfer });

	for (const listener of targetItem.listeners.get('dragover')) {
		listener({ clientY: 35, dataTransfer, preventDefault() {} });
	}
	const placeholder = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-reorder-placeholder-vertical'),
	);
	assert.ok(placeholder);

	for (const listener of targetItem.listeners.get('dragover')) {
		listener({ clientY: 18, dataTransfer, preventDefault() {} });
	}
	assert.equal(
		descendants(parent).find((element) =>
			element.classList.contains('aulyckanban-reorder-placeholder-vertical'),
		),
		placeholder,
	);

	for (const listener of targetItem.listeners.get('dragover')) {
		listener({ clientY: 5, dataTransfer, preventDefault() {} });
	}
	assert.equal(
		descendants(parent).some((element) =>
			element.classList.contains('aulyckanban-reorder-placeholder-vertical'),
		),
		false,
	);
});

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
