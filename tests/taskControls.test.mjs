import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

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
		this.ownerDocument = { activeElement: null };
		this.classList = {
			contains: (value) => this.classes.has(value),
		};
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

const source = readFileSync(new URL('../src/ui/TaskControls.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function createHarness(overrides = {}) {
	const module = { exports: {} };
	const context = {
		module,
		exports: module.exports,
		requestAnimationFrame: (callback) => callback(),
		require: (id) => {
			if (id === '../i18n') return { t: (key) => key };
			if (id === '../utils/taskQuery') {
				return {
					normalizeTaskSearchText: (value) => value.trim().toLowerCase().replace(/\s+/g, ' '),
				};
			}
			if (id === '../utils/dom') {
				return {
					appendAccessibleLabel: (element, text) =>
						element.createSpan({ cls: 'aulyckanban-accessible-label', text }),
				};
			}
			if (id === './InlineInput') {
				return {
					createInlineInput: (parent, options) => {
						const input = parent.createEl(options.multiline ? 'textarea' : 'input', {
							cls: options.cls,
						});
						input.value = options.initialValue ?? '';
						input.inputOptions = options;
						return input;
					},
				};
			}
			if (id === 'obsidian') return { Notice: class {}, setIcon: () => {} };
			throw new Error(`Unexpected import: ${id}`);
		},
	};
	vm.runInNewContext(output, context);

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
	const controls = new context.module.exports.TaskControls(parent, {}, store);
	return { controls, parent, store };
}

test('search input commits one trimmed filter keyword', () => {
	const { parent, store } = createHarness();
	const input = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-search-input'),
	);
	assert.ok(input);

	input.inputOptions.onCommit('  邮箱任务  ');
	assert.equal(store.actions.at(-1).type, 'SET_SEARCH_QUERY');
	assert.equal(store.actions.at(-1).payload.keyword, '邮箱任务');
});

test('committed search is rendered as one removable tag', () => {
	const { parent, store } = createHarness({ keyword: '邮箱任务' });
	const tag = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-search-tag'),
	);
	const clearButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-search-clear'),
	);
	assert.ok(tag);
	assert.equal(tag.children[0].textContent, '邮箱任务');
	assert.ok(clearButton);

	clearButton.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });
	assert.equal(store.actions.at(-1).type, 'SET_SEARCH_QUERY');
	assert.equal(store.actions.at(-1).payload.keyword, '');
});

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
