import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

class MockElement {
	constructor(tagName = 'div', options = {}) {
		this.tagName = tagName;
		this.children = [];
		this.parentElement = null;
		this.attributes = { ...(options.attr ?? {}) };
		this.classes = new Set(
			String(options.cls ?? '')
				.split(/\s+/)
				.filter(Boolean),
		);
		this.textContent = options.text ?? '';
		this.listeners = new Map();
		this.value = '';
		this.ownerDocument = {
			activeElement: null,
			defaultView: { requestAnimationFrame: (callback) => callback() },
		};
		this.classList = {
			contains: (value) => this.classes.has(value),
		};
	}

	get doc() {
		return this.ownerDocument;
	}

	get win() {
		return this.ownerDocument.defaultView;
	}

	append(child) {
		child.parentElement = this;
		child.ownerDocument = this.ownerDocument;
		this.children.push(child);
		return child;
	}

	createDiv(options = {}) {
		return this.append(new MockElement('div', options));
	}

	createSpan(options = {}) {
		return this.append(new MockElement('span', options));
	}

	createEl(tagName, options = {}) {
		return this.append(new MockElement(tagName, options));
	}

	empty() {
		this.children = [];
	}

	addEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push(listener);
		this.listeners.set(name, listeners);
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
	}

	contains(candidate) {
		return candidate === this || descendants(this).includes(candidate);
	}

	focus() {}
}

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}

const { TaskControls } = await loadSourceModule(
	new URL('../src/ui/TaskControls.ts', import.meta.url),
	{
		label: 'task-controls',
		mocks: {
			'../i18n': { t: (key) => key },
			'../utils/taskQuery': {
				normalizeTaskSearchText: (value) => value.trim().toLowerCase().replace(/\s+/g, ' '),
			},
			'../utils/dom': {
				appendAccessibleLabel: (element, text) =>
					element.createSpan({ cls: 'aulyckanban-accessible-label', text }),
			},
			'./InlineInput': {
				createInlineInput: (parent, options) => {
					const input = parent.createEl(options.multiline ? 'textarea' : 'input', {
						cls: options.cls,
					});
					input.value = options.initialValue ?? '';
					input.inputOptions = options;
					return input;
				},
			},
			obsidian: { Notice: class {}, setIcon: () => {} },
		},
	},
);

function createHarness(overrides = {}, onStartAdding) {
	const store = {
		actions: [],
		keyword: '',
		taskScope: 'current',
		columnScope: 'current',
		getSearchKeyword() {
			return this.keyword;
		},
		getTaskScope() {
			return this.taskScope;
		},
		getColumnScope() {
			return this.columnScope;
		},
		getCurrentView: () => 'personal',
		getActiveColumnId: () => 'base',
		getTaskViews: () => [
			{ id: 'work', title: '工作任务' },
			{ id: 'personal', title: '个人任务' },
		],
		getCurrentColumns: () => [
			{ id: 'base', title: '基础' },
			{ id: 'later', title: '稍后' },
		],
		dispatch(action) {
			this.actions.push(action);
			if (action.type === 'SET_SEARCH_QUERY') this.keyword = action.payload.keyword;
		},
		...overrides,
	};
	const parent = new MockElement();
	const controls = new TaskControls(parent, {}, store, onStartAdding);
	return { controls, parent, store };
}

test('collapsed add control expands and creates a task in the concrete intersection', () => {
	const { parent, store } = createHarness();
	const addButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-add-btn'),
	);
	assert.ok(addButton);
	addButton.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });

	const input = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-create-input'),
	);
	assert.ok(input);
	input.inputOptions.onCommit('新增内容');
	assert.equal(store.actions.at(-1).type, 'ADD_TASK');
	assert.equal(store.actions.at(-1).payload.viewId, 'personal');
	assert.equal(store.actions.at(-1).payload.columnId, 'base');
	assert.equal(store.actions.at(-1).payload.content, '新增内容');
});

test('opening the create editor requests cancellation of any active task selection', () => {
	let cancellationCount = 0;
	const { parent } = createHarness({}, () => {
		cancellationCount += 1;
	});
	const addButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-add-btn'),
	);
	addButton.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });

	assert.equal(cancellationCount, 1);
	assert.equal(
		descendants(parent).some((element) =>
			element.classList.contains('aulyckanban-task-create-input'),
		),
		true,
	);
});

test('aggregate scopes require explicit task type and quadrant targets before creating', () => {
	const { parent, store } = createHarness({ taskScope: 'all', columnScope: 'all' });
	const addButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-add-btn'),
	);
	addButton.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });

	const viewSelect = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-create-view-select'),
	);
	const columnSelect = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-create-column-select'),
	);
	assert.ok(viewSelect);
	assert.ok(columnSelect);
	viewSelect.value = 'work';
	viewSelect.listeners.get('change')[0]();
	columnSelect.value = 'later';
	columnSelect.listeners.get('change')[0]();

	const input = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-create-input'),
	);
	input.inputOptions.onCommit('跨范围新增');
	assert.equal(store.actions.at(-1).payload.viewId, 'work');
	assert.equal(store.actions.at(-1).payload.columnId, 'later');
});

test('moving focus between aggregate destination controls keeps the create editor open', () => {
	const { parent } = createHarness({ taskScope: 'all', columnScope: 'all' });
	const addButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-add-btn'),
	);
	addButton.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });

	const editor = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-create-editor'),
	);
	const viewSelect = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-create-view-select'),
	);
	editor.ownerDocument.activeElement = viewSelect;
	editor.listeners.get('focusout')[0]();
	assert.equal(
		descendants(parent).some((element) =>
			element.classList.contains('aulyckanban-task-create-input'),
		),
		true,
	);

	editor.ownerDocument.activeElement = new MockElement('button');
	editor.listeners.get('focusout')[0]();
	assert.equal(
		descendants(parent).some((element) =>
			element.classList.contains('aulyckanban-task-create-input'),
		),
		false,
	);
});

test('archive scope does not expose a new task destination', () => {
	const { parent } = createHarness({ taskScope: 'archive' });
	assert.equal(
		descendants(parent).some((element) => element.classList.contains('aulyckanban-task-add-btn')),
		false,
	);
});
