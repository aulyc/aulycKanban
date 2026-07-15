import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

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

const source = readFileSync(new URL('../src/ui/TaskCard.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES2020,
	},
}).outputText;

function createHarness() {
	const documentRef = {
		activeElement: null,
		createElement: () => new MockElement(documentRef),
	};
	const inlineInputs = [];
	const module = { exports: {} };
	const context = {
		module,
		exports: module.exports,
		document: documentRef,
		require: (id) => {
			if (id === '../i18n') return { t: (key) => key };
			if (id === '../utils/datetime') return { formatDateTimeMinute: () => '2026/07/13 12:00' };
			if (id === '../utils/dom')
				return {
					setTextWithLineBreaks: (el, value) => {
						el.textContent = value;
					},
				};
			if (id === './ConfirmModal') return { ConfirmModal: class {} };
			if (id === './InlineInput') {
				return {
					createInlineInput: (parent, options) => {
						inlineInputs.push(options);
						const input = parent.createDiv({ cls: options.cls });
						if (options.focusOnMount) input.focus();
						return input;
					},
				};
			}
			throw new Error(`Unexpected import: ${id}`);
		},
	};
	vm.runInNewContext(output, context);

	const actions = [];
	const card = new context.module.exports.TaskCard(
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
	return { actions, card, documentRef, inlineInputs };
}

test('first mouse click selects a task and the second click edits it', () => {
	const { card, documentRef, inlineInputs } = createHarness();
	const click = card.listeners.get('click')[0];
	const event = { stopPropagation() {} };

	click(event);
	assert.equal(documentRef.activeElement, card);
	assert.equal(card.classList.contains('aulyckanban-task-editing'), false);
	assert.equal(inlineInputs.length, 0);

	click(event);
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
	const { actions, card, documentRef, inlineInputs } = createHarness();
	const sourceLabel = descendants(card).find((element) =>
		element.classList.contains('aulyckanban-task-source'),
	);
	assert.equal(sourceLabel.textContent, '工作任务');
	assert.equal(card.dataset.viewId, 'work');

	documentRef.activeElement = card;
	card.listeners.get('click')[0]({ stopPropagation() {} });
	inlineInputs[0].onCommit('修改后', 'blur');
	assert.equal(actions.at(-1).type, 'EDIT_TASK');
	assert.equal(actions.at(-1).payload.viewId, 'work');
	assert.equal(actions.at(-1).payload.columnId, 'column');
});
