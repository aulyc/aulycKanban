import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

class MockElement {
	constructor(documentRef, options = {}) {
		this.documentRef = documentRef;
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

	append(child) {
		child.parentElement = this;
		this.children.push(child);
		return child;
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

function createHarness() {
	const documentRef = {
		activeElement: null,
		defaultView: {
			requestAnimationFrame: (callback) => callback(),
		},
	};
	documentRef.defaultView.HTMLElement = MockElement;
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
	).getEl();
	return { actions, card, documentRef, icons, inlineInputs };
}

test('task archive action reuses the toolbar archive folder icon', () => {
	const { card, icons } = createHarness();
	const archiveButton = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-archive'),
	);

	assert.equal(icons.length, 1);
	assert.equal(icons[0].element, archiveButton);
	assert.equal(icons[0].name, 'archive');
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
