import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

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

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
let activeInstances = new Map();
const component = (name) =>
	class {
		constructor(parent) {
			this.parent = parent;
			this.el = parent.createDiv({ cls: `mock-${name}` });
			this.renderCount = 0;
			activeInstances.set(name, this);
		}
		render() {
			this.renderCount += 1;
		}
		getEl() {
			return this.el;
		}
	};
const { Board } = await loadSourceModule(new URL('../src/ui/Board.ts', import.meta.url), {
	label: 'board',
	mocks: {
		'./UtilityBar': { UtilityBar: component('utility') },
		'./Toolbar': { Toolbar: component('toolbar') },
		'./TaskControls': { TaskControls: component('controls') },
		'./TaskList': { TaskList: component('tasks') },
		'./ArchiveView': { ArchiveView: component('archive') },
		'./CategoryNav': { CategoryNav: component('columns') },
	},
});

function rule(selector) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return css.match(new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))?.[1] ?? '';
}

test('utility row precedes task types while task add stays above normal and archive results', () => {
	const instances = new Map();
	activeInstances = instances;

	const store = {
		archive: false,
		isShowingArchive() {
			return this.archive;
		},
	};
	const root = new MockElement();
	const board = new Board(root, {}, store);
	assert.equal(instances.get('utility').parent, root);
	assert.equal(instances.get('toolbar').parent, root);
	assert.equal(root.children[0], instances.get('utility').el);
	assert.equal(root.children[1], instances.get('toolbar').el);
	const taskPane = instances.get('controls').parent;
	assert.equal(taskPane.classes.has('aulyckanban-task-pane'), true);
	assert.equal(instances.get('tasks').parent, taskPane);
	assert.equal(instances.get('archive').parent.parentElement, taskPane);

	board.render();
	assert.equal(instances.get('utility').renderCount, 1);
	assert.equal(instances.get('toolbar').renderCount, 1);
	assert.equal(instances.get('controls').renderCount, 1);
	assert.equal(instances.get('tasks').renderCount, 1);
	store.archive = true;
	board.render();
	assert.equal(instances.get('utility').renderCount, 2);
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
	assert.match(
		rule('.aulyckanban-task-pane.aulyckanban-mode-archive .aulyckanban-task-controls'),
		/display:\s*none/,
	);
	assert.match(rule('.aulyckanban-task-list'), /padding:\s*0/);
	assert.match(rule('.aulyckanban-archive-controls'), /padding:\s*0/);
	assert.match(rule('.aulyckanban-archive-list'), /padding:\s*0/);
});

test('utility row keeps search flexible and archive fixed above the task types', () => {
	const utility = rule('.aulyckanban-utility-bar');
	assert.match(utility, /display:\s*grid/);
	assert.match(utility, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
	assert.match(utility, /border-bottom:\s*1px solid var\(--background-modifier-border\)/);

	const taskTypes = rule('.aulyckanban-toolbar-left');
	assert.match(taskTypes, /grid-template-columns:\s*auto minmax\(0, 1fr\) auto/);
});

test('task list is transparent while each task card owns a themed surface', () => {
	assert.match(rule('.aulyckanban-task-list'), /background:\s*transparent/);
	assert.match(rule('.aulyckanban-task'), /background:\s*var\(--background-secondary\)/);
});

test('task metadata stacks source and time at the left edge', () => {
	assert.match(rule('.aulyckanban-task-meta-row'), /align-items:\s*flex-end/);
	const details = rule('.aulyckanban-task-meta-details');
	assert.match(details, /flex-direction:\s*column/);
	assert.match(details, /align-items:\s*flex-start/);
	const time = rule('.aulyckanban-task-time');
	assert.match(time, /display:\s*flex/);
	assert.match(time, /flex-direction:\s*column/);
	assert.match(time, /align-items:\s*flex-start/);
	assert.match(time, /white-space:\s*nowrap/);
});
