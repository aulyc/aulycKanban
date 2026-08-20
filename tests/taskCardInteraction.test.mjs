import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

class MockElement {
	constructor(documentRef, options = {}) {
		this.documentRef = documentRef;
		this.ownerDocument = documentRef;
		this.children = [];
		this.dataset = {};
		this.attributes = {};
		this.listeners = new Map();
		this.textContent = options.text ?? '';
		this.classes = new Set(
			String(options.cls ?? '')
				.split(/\s+/)
				.filter(Boolean),
		);
		this.classList = {
			contains: (value) => this.classes.has(value),
		};
		this.doc = documentRef;
		this.win = documentRef.defaultView;
	}

	set className(value) {
		this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
	}

	createDiv(options = {}) {
		return this.append(new MockElement(this.documentRef, options));
	}

	createSpan(options = {}) {
		return this.createDiv(options);
	}

	createEl(_tagName, options = {}) {
		return this.createDiv(options);
	}

	append(child) {
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	appendChild(child) {
		return this.append(child);
	}

	remove() {
		if (!this.parentElement) return;
		this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
		this.parentElement = null;
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
	}

	setText(value) {
		this.textContent = value;
	}

	addClass(value) {
		this.classes.add(value);
	}

	removeClass(value) {
		this.classes.delete(value);
	}

	addEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push(listener);
		this.listeners.set(name, listeners);
	}

	empty() {
		this.children = [];
	}

	querySelector(selector) {
		if (!selector.startsWith('.')) return null;
		const className = selector.slice(1);
		return descendants(this).find((child) => child.classList.contains(className)) ?? null;
	}

	focus() {
		this.documentRef.activeElement = this;
	}

	getBoundingClientRect() {
		return { left: 10, top: 20, width: 100, height: 40, right: 110, bottom: 60 };
	}
}

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}

let activeIcons = [];
let activeInlineInputs = [];
const { TaskCard } = await loadSourceModule(new URL('../src/ui/TaskCard.ts', import.meta.url), {
	label: 'task-card',
	mocks: {
		obsidian: {
			setIcon: (element, name) => {
				activeIcons.push({ element, name });
			},
		},
		'../i18n': { t: (key) => key },
		'../utils/datetime': {
			formatDateTimeMinute: () => '2026/07/13 12:00',
		},
		'../utils/dom': {
			setTextWithLineBreaks: (element, value) => {
				element.textContent = value;
			},
		},
		'./ConfirmModal': { ConfirmModal: class {} },
		'./InlineInput': {
			createInlineInput: (parent, options) => {
				activeInlineInputs.push(options);
				const input = parent.createDiv({ cls: options.cls });
				if (options.focusOnMount) input.focus();
				return input;
			},
		},
	},
});

function createHarness(options = {}) {
	const documentRef = {
		activeElement: null,
		defaultView: {
			requestAnimationFrame: (callback) => callback(),
		},
	};
	documentRef.body = new MockElement(documentRef);
	documentRef.defaultView.HTMLElement = MockElement;
	documentRef.defaultView.MouseEvent = class {
		constructor(type, eventOptions) {
			this.type = type;
			Object.assign(this, eventOptions);
		}
	};
	const inlineInputs = [];
	const icons = [];
	activeInlineInputs = inlineInputs;
	activeIcons = icons;
	const actions = [];
	const parent = new MockElement(documentRef);
	const card = new TaskCard(
		parent,
		{},
		{ dispatch: (action) => actions.push(action) },
		'work',
		'column',
		{
			id: 'task',
			content: '测试',
			completed: false,
			createdAt: '2026-07-13T12:00:00Z',
		},
		'工作任务',
		options,
	).getEl();
	return { actions, card, documentRef, icons, inlineInputs };
}

test('selection mode uses card clicks and checkboxes without entering content editing', () => {
	const selected = [];
	const { card, inlineInputs } = createHarness({
		selectionMode: true,
		selected: true,
		onSelectionRequest: (event) => selected.push(event),
	});
	assert.equal(card.classList.contains('aulyckanban-task-selected'), true);
	const checkbox = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-select-checkbox'),
	);
	assert.ok(checkbox);
	assert.equal(checkbox.checked, true);
	const actions = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-actions'),
	);
	const label = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-select-label'),
	);
	assert.equal(label.parentElement, actions);
	assert.equal(actions.children.at(-1), label);

	card.listeners.get('click')[0]({
		metaKey: false,
		ctrlKey: false,
		shiftKey: false,
		preventDefault() {},
		stopPropagation() {},
	});
	assert.equal(selected.length, 1);
	let enterPrevented = false;
	card.listeners.get('keydown')[0]({
		key: 'Enter',
		target: card,
		preventDefault() {
			enterPrevented = true;
		},
		stopPropagation() {},
	});
	assert.equal(enterPrevented, true);
	assert.equal(selected.length, 2);
	const content = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-content'),
	);
	content.listeners.get('dblclick')[0]({ preventDefault() {}, stopPropagation() {} });
	assert.equal(inlineInputs.length, 0);
});

test('modifier click enters selection and right click delegates the exact card coordinate', () => {
	const selectionEvents = [];
	const menuEvents = [];
	const { card } = createHarness({
		onSelectionRequest: (event) => selectionEvents.push(event),
		onContextMenu: (event) => menuEvents.push(event),
	});
	card.listeners.get('click')[0]({
		metaKey: true,
		ctrlKey: false,
		shiftKey: false,
		preventDefault() {},
		stopPropagation() {},
	});
	assert.equal(selectionEvents.length, 1);

	card.listeners.get('contextmenu')[0]({ preventDefault() {}, stopPropagation() {} });
	assert.equal(menuEvents.length, 1);
});

test('keyboard context-menu shortcut opens the same task move menu', () => {
	const menuEvents = [];
	const { card } = createHarness({ onContextMenu: (event) => menuEvents.push(event) });
	let prevented = false;
	card.listeners.get('keydown')[0]({
		key: 'F10',
		shiftKey: true,
		target: card,
		preventDefault: () => {
			prevented = true;
		},
		stopPropagation() {},
	});
	assert.equal(prevented, true);
	assert.equal(menuEvents.length, 1);
	assert.equal(menuEvents[0].type, 'contextmenu');
});

test('desktop drag starts only from the metadata row and keeps the content non-draggable', () => {
	const events = [];
	const { card } = createHarness({
		onDragStart: (event) => events.push(['start', event]),
		onDragEnd: (event) => events.push(['end', event]),
	});
	const content = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-content'),
	);
	const metaRow = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-meta-row'),
	);
	assert.notEqual(card.draggable, true);
	assert.notEqual(content.draggable, true);
	assert.equal(metaRow.draggable, true);
	assert.equal(card.listeners.has('dragstart'), false);
	assert.equal(content.listeners.has('dragstart'), false);
	const transfer = {
		setDragImage(element, x, y) {
			this.dragImage = { element, x, y };
		},
	};
	const startEvent = { dataTransfer: transfer };
	metaRow.listeners.get('dragstart')[0](startEvent);
	assert.equal(card.classList.contains('aulyckanban-task-dragging'), true);
	assert.deepEqual(transfer.dragImage, { element: card, x: 24, y: 20 });
	metaRow.listeners.get('dragend')[0]({});
	assert.equal(card.classList.contains('aulyckanban-task-dragging'), false);
	assert.deepEqual(events, [
		['start', startEvent],
		['end', {}],
	]);
});

test('dragging multiple selected tasks uses a count-aware drag image', () => {
	const { card, documentRef } = createHarness({
		onDragStart: () => 3,
	});
	const metaRow = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-meta-row'),
	);
	const transfer = {
		setDragImage(element, x, y) {
			this.dragImage = { element, x, y };
		},
	};
	metaRow.listeners.get('dragstart')[0]({ dataTransfer: transfer });

	assert.equal(
		transfer.dragImage.element.classList.contains('aulyckanban-task-drag-preview'),
		true,
	);
	assert.equal(transfer.dragImage.element.textContent, 'task.drag.count');
	assert.deepEqual([transfer.dragImage.x, transfer.dragImage.y], [24, 20]);
	assert.equal(documentRef.body.children.length, 0);
});

test('task actions use the shared archive and delete icons', () => {
	const { card, icons } = createHarness();
	const archiveButton = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-archive'),
	);
	const deleteButton = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-delete'),
	);

	assert.equal(icons.length, 2);
	assert.equal(icons[0].element, archiveButton);
	assert.equal(icons[0].name, 'archive');
	assert.equal(icons[1].element, deleteButton);
	assert.equal(icons[1].name, 'x');
	assert.equal(deleteButton.attributes['aria-label'], 'task.confirm.delete');
});

test('single mouse clicks only select a task and double-clicking its content edits it', () => {
	const { card, documentRef, inlineInputs } = createHarness();
	const click = card.listeners.get('click')[0];
	const event = { stopPropagation() {} };

	click(event);
	assert.equal(documentRef.activeElement, card);
	assert.equal(card.classList.contains('aulyckanban-task-editing'), false);
	assert.equal(inlineInputs.length, 0);

	click(event);
	assert.equal(documentRef.activeElement, card);
	assert.equal(card.classList.contains('aulyckanban-task-editing'), false);
	assert.equal(inlineInputs.length, 0);

	const content = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-content'),
	);
	let defaultPrevented = false;
	content.listeners.get('dblclick')[0]({
		preventDefault() {
			defaultPrevented = true;
		},
		stopPropagation() {},
	});
	assert.equal(defaultPrevented, true);
	assert.equal(card.classList.contains('aulyckanban-task-editing'), true);
	assert.equal(inlineInputs.length, 1);
	assert.equal(inlineInputs[0].stopClickPropagation, true);
});

test('Enter edits an already selected task', () => {
	const { card, inlineInputs } = createHarness();
	card.focus();
	const keydown = card.listeners.get('keydown')[0];
	keydown({ key: 'Enter', target: card, preventDefault() {}, stopPropagation() {} });

	assert.equal(card.classList.contains('aulyckanban-task-editing'), true);
	assert.equal(inlineInputs.length, 1);
});

test('aggregate cards display their source and dispatch edits to that exact task type', () => {
	const { actions, card, inlineInputs } = createHarness();
	const sourceLabel = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-source'),
	);
	assert.equal(sourceLabel.textContent, '工作任务');
	assert.equal(card.dataset.viewId, 'work');

	const content = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-content'),
	);
	content.listeners.get('dblclick')[0]({ preventDefault() {}, stopPropagation() {} });
	inlineInputs[0].onCommit('修改后', 'blur');
	assert.equal(actions.at(-1).type, 'EDIT_TASK');
	assert.equal(actions.at(-1).payload.viewId, 'work');
	assert.equal(actions.at(-1).payload.columnId, 'column');
});

test('task metadata renders date and time on one line below the source label', () => {
	const { card } = createHarness();
	const metaRow = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-meta-row'),
	);
	const metaDetails = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-meta-details'),
	);
	const actions = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-actions'),
	);

	assert.ok(metaRow);
	assert.ok(metaDetails);
	assert.equal(metaRow.children[0], metaDetails);
	assert.equal(metaRow.children[1], actions);
	assert.equal(metaDetails.children[0].classList.contains('aulyckanban-task-source'), true);
	assert.equal(metaDetails.children[0].textContent, '工作任务');
	assert.equal(metaDetails.children[1].classList.contains('aulyckanban-task-time'), true);
	assert.equal(metaDetails.children[1].textContent, '2026/07/13 12:00');
	assert.equal(metaDetails.children[1].children.length, 0);
});
