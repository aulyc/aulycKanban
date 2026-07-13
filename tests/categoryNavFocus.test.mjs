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
		this.classes = new Set(String(options.cls ?? '').split(/\s+/).filter(Boolean));
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
			if (id === '../i18n') return { t: (key) => key === 'column.addPrompt' ? '输入新象限名称' : key };
			if (id === './ConfirmModal') return { ConfirmModal: class {} };
			if (id === './InlineInput') {
				return {
					createInlineInput: (parent, options) => parent.createDiv({ cls: options.cls }),
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

test('entering add mode keeps an explicit editing state and removes tooltip semantics', () => {
	const { parent } = createCategoryNavHarness();
	const nav = parent.children[0];
	const initialAddButton = descendants(nav).find((element) => (
		element.classList.contains('aulyckanban-nav-add-btn')
	));
	assert.equal(initialAddButton.attributes['aria-label'], '输入新象限名称');

	const keydown = initialAddButton.listeners.get('keydown')[0];
	keydown({ key: 'Enter', preventDefault() {}, stopPropagation() {} });

	const editingAddContainer = descendants(nav).find((element) => (
		element.classList.contains('aulyckanban-nav-add-btn')
	));
	assert.equal(nav.classList.contains('aulyckanban-category-nav-editing'), true);
	assert.equal(editingAddContainer.attributes['aria-label'], undefined);
	assert.equal(editingAddContainer.attributes.role, undefined);
	assert.equal(editingAddContainer.children[0].classList.contains('aulyckanban-nav-inline-input'), true);
});

test('editing state suppresses the selected quadrant independently of transient focus', () => {
	const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
	assert.match(
		css,
		/\.aulyckanban-category-nav-editing\s+\.aulyckanban-nav-item-active/,
	);
});
