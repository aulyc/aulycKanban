import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

class MockElement {
	constructor(tagName, options, documentRef) {
		this.tagName = tagName;
		this.documentRef = documentRef;
		this.parentElement = null;
		this.children = [];
		this.dataset = {};
		this.attributes = { ...(options?.attr ?? {}) };
		this.classes = new Set(String(options?.cls ?? '').split(/\s+/).filter(Boolean));
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
const output = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES2020,
	},
}).outputText;

function createToolbarHarness() {
	const documentRef = { activeElement: null };
	const module = { exports: {} };
	const context = {
		module,
		exports: module.exports,
		document: documentRef,
		HTMLElement: MockElement,
		requestAnimationFrame: (callback) => callback(),
		require: (id) => {
			if (id === '../i18n') return { t: (key) => key };
			if (id === './InlineInput') return { createInlineInput: () => ({}) };
			if (id === './ConfirmModal') return { ConfirmModal: class {} };
			if (id === '../utils/focusCycle') return { revealTaskTypeItem: () => {} };
			if (id === 'obsidian') return { Menu: class {}, setIcon: () => {} };
			throw new Error(`Unexpected import: ${id}`);
		},
	};
	vm.runInNewContext(output, context);

	const store = {
		currentView: 'work',
		getCurrentView() { return this.currentView; },
		isShowingArchive: () => false,
		getTaskViews: () => [
			{ id: 'work', title: 'Work' },
			{ id: 'test', title: 'Test' },
		],
		dispatch: () => {},
	};
	const parent = new MockElement('div', {}, documentRef);
	const toolbar = new context.module.exports.Toolbar(parent, {}, store);
	return { documentRef, parent, store, toolbar };
}

test('task type controls stay out of the native Tab order', () => {
	const { parent } = createToolbarHarness();
	const buttons = descendants(parent).filter((element) => element.tagName === 'button');
	assert.equal(buttons.length, 4);
	assert.equal(buttons.every((button) => button.attributes.tabindex === '-1'), true);
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

test('entering task type add mode explicitly marks the toolbar as editing', () => {
	const { parent } = createToolbarHarness();
	const toolbarEl = parent.children[0];
	const addButton = descendants(toolbarEl).find((element) => (
		element.classList.contains('aulyckanban-view-add-btn')
	));
	const click = addButton.listeners.get('click')[0];

	click({ preventDefault() {}, stopPropagation() {} });

	assert.equal(toolbarEl.classList.contains('aulyckanban-toolbar-editing'), true);
});

test('task type add focus explicitly marks and clears the board focus state', () => {
	const { parent } = createToolbarHarness();
	const addButton = descendants(parent).find((element) => (
		element.classList.contains('aulyckanban-view-add-btn')
	));

	addButton.listeners.get('focus')[0]();
	assert.equal(parent.classList.contains('aulyckanban-view-add-focused'), true);

	addButton.listeners.get('blur')[0]();
	assert.equal(parent.classList.contains('aulyckanban-view-add-focused'), false);
});

test('task type tabs expose rename and delete management actions', () => {
	assert.match(source, /addEventListener\('contextmenu'/);
	assert.match(source, /t\('view\.rename'\)/);
	assert.match(source, /t\('view\.delete'\)/);
	assert.match(source, /type: 'RENAME_VIEW'/);
	assert.match(source, /type: 'DELETE_VIEW'/);
});
