import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

class MockElement {
	constructor(options = {}) {
		this.children = [];
		this.classes = new Set(
			String(options.cls ?? '')
				.split(/\s+/)
				.filter(Boolean),
		);
		this.attributes = {};
	}

	createDiv(options = {}) {
		const child = new MockElement(options);
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
	}

	toggleClass(name, enabled) {
		if (enabled) this.classes.add(name);
		else this.classes.delete(name);
	}

	empty() {
		this.children = [];
	}
}

const source = readFileSync(new URL('../src/ui/Board.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function rule(selector) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return css.match(new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))?.[1] ?? '';
}

test('shared search and add controls stay above both normal and archive task results', () => {
	const instances = new Map();
	const component = (name) =>
		class {
			constructor(parent) {
				this.parent = parent;
				this.el = parent.createDiv({ cls: `mock-${name}` });
				this.renderCount = 0;
				instances.set(name, this);
			}
			render() {
				this.renderCount += 1;
			}
			getEl() {
				return this.el;
			}
		};
	const module = { exports: {} };
	vm.runInNewContext(output, {
		module,
		exports: module.exports,
		require: (id) => {
			if (id === './Toolbar') return { Toolbar: component('toolbar') };
			if (id === './TaskControls') return { TaskControls: component('controls') };
			if (id === './TaskList') return { TaskList: component('tasks') };
			if (id === './ArchiveView') return { ArchiveView: component('archive') };
			if (id === './CategoryNav') return { CategoryNav: component('columns') };
			throw new Error(`Unexpected import: ${id}`);
		},
	});

	const store = {
		archive: false,
		isShowingArchive() {
			return this.archive;
		},
	};
	const root = new MockElement();
	const board = new module.exports.Board(root, {}, store);
	const taskPane = instances.get('controls').parent;
	assert.equal(taskPane.classes.has('aulyckanban-task-pane'), true);
	assert.equal(instances.get('tasks').parent, taskPane);
	assert.equal(instances.get('archive').parent.parentElement, taskPane);

	board.render();
	assert.equal(instances.get('controls').renderCount, 1);
	assert.equal(instances.get('tasks').renderCount, 1);
	store.archive = true;
	board.render();
	assert.equal(instances.get('controls').renderCount, 2);
	assert.equal(instances.get('archive').renderCount, 1);
	assert.equal(taskPane.classes.has('aulyckanban-mode-archive'), true);
});

test('normal and archive task components share one horizontal content edge', () => {
	const root = rule('.aulyckanban-kanban-container');
	assert.match(root, /--aulyckanban-task-content-inset:\s*4px/);

	const pane = rule('.aulyckanban-task-pane');
	assert.match(pane, /box-sizing:\s*border-box/);
	assert.match(pane, /padding-inline:\s*var\(--aulyckanban-task-content-inset\)/);

	assert.match(rule('.aulyckanban-task-controls'), /padding:\s*0 0 10px/);
	assert.match(rule('.aulyckanban-task-list'), /padding:\s*0/);
	assert.match(rule('.aulyckanban-archive-controls'), /padding:\s*0/);
	assert.match(rule('.aulyckanban-archive-list'), /padding:\s*0/);
});

test('task list is transparent while each task card owns a themed surface', () => {
	assert.match(rule('.aulyckanban-task-list'), /background:\s*transparent/);
	assert.match(rule('.aulyckanban-task'), /background:\s*var\(--background-secondary\)/);
});

test('task metadata stacks time and source at the left edge', () => {
	assert.match(rule('.aulyckanban-task-meta-row'), /align-items:\s*flex-end/);
	const details = rule('.aulyckanban-task-meta-details');
	assert.match(details, /flex-direction:\s*column/);
	assert.match(details, /align-items:\s*flex-start/);
});
