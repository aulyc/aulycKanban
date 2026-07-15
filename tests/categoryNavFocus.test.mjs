import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

class MockElement {
	constructor(options = {}) {
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
		const child = new MockElement(options);
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

	querySelector() {
		return null;
	}
}

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}

const source = readFileSync(new URL('../src/ui/CategoryNav.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES2020,
	},
}).outputText;

function createCategoryNavHarness() {
	const module = { exports: {} };
	const context = {
		module,
		exports: module.exports,
		require: (id) => {
			if (id === 'obsidian') return { Menu: class {} };
			if (id === '../i18n')
				return { t: (key) => (key === 'column.addPrompt' ? '输入新象限名称' : key) };
			if (id === './ConfirmModal') return { ConfirmModal: class {} };
			if (id === './InlineInput') {
				return {
					createInlineInput: (parent, options) => parent.createDiv({ cls: options.cls }),
				};
			}
			if (id === '../utils/dom') {
				return {
					appendAccessibleLabel: (element, text) =>
						element.createSpan({
							cls: 'aulyckanban-accessible-label',
							text,
						}),
				};
			}
			throw new Error(`Unexpected import: ${id}`);
		},
	};
	vm.runInNewContext(output, context);

	const store = {
		getCurrentColumns: () => [{ id: 'last', title: '多少啊', tasks: [] }],
		getActiveColumnId: () => 'last',
		isShowingArchive: () => false,
		getArchiveTaskCount: () => 0,
		dispatch: () => {},
	};
	const parent = new MockElement();
	new context.module.exports.CategoryNav(parent, {}, store);
	return { parent };
}

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

test('transient editor focus suppresses only the visual selection without a JS state class', () => {
	const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
	assert.match(
		css,
		/\.aulyckanban-category-nav:has\(\.aulyckanban-nav-inline-input:focus\)\s+\.aulyckanban-nav-item-active/,
	);
	assert.doesNotMatch(source, /aulyckanban-category-nav-editing/);
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
