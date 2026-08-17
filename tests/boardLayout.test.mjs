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
		this.attributes = { ...(options.attr ?? {}) };
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
		constructor(parent, ...args) {
			this.parent = parent;
			this.args = args;
			this.el = parent.createDiv({ cls: `mock-${name}` });
			this.renderCount = 0;
			activeInstances.set(name, this);
		}
		render() {
			this.renderCount += 1;
		}
		setStatusEl(statusEl) {
			this.statusEl = statusEl;
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
	const taskHeader = instances.get('controls').parent;
	assert.equal(taskHeader.classes.has('aulyckanban-task-header'), true);
	const taskPane = taskHeader.parentElement;
	assert.equal(taskPane.classes.has('aulyckanban-task-pane'), true);
	assert.equal(instances.get('tasks').parent, taskPane);
	const selectionControls = instances.get('tasks').args[3];
	assert.equal(selectionControls.parentElement, taskHeader);
	assert.equal(selectionControls.classes.has('aulyckanban-task-selection-controls'), true);
	assert.equal(instances.get('archive').parent.parentElement, taskPane);
	assert.equal(instances.get('archive').parent.attributes.tabindex, undefined);
	const footer = root.children.at(-1);
	assert.equal(footer.classes.has('aulyckanban-board-footer'), true);
	assert.equal(footer.children[0].classes.has('aulyckanban-board-footer-status'), true);
	assert.equal(instances.get('tasks').statusEl, footer.children[0]);
	assert.equal(footer.children[0].attributes.role, 'status');
	assert.equal(footer.children[0].attributes['aria-live'], 'polite');

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

	const header = rule('.aulyckanban-task-header');
	assert.match(header, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
	assert.match(header, /padding:\s*0 0 10px/);
	assert.match(rule('.aulyckanban-task-controls'), /padding:\s*0/);
	assert.match(
		rule('.aulyckanban-task-pane.aulyckanban-mode-archive .aulyckanban-task-header'),
		/display:\s*none/,
	);
	assert.match(rule('.aulyckanban-task-list'), /padding:\s*0/);
	assert.match(rule('.aulyckanban-archive-controls'), /padding:\s*0/);
	assert.match(rule('.aulyckanban-archive-list'), /padding:\s*0/);
});

test('collapsed and expanded task creation reserve the same single-row height', () => {
	assert.match(rule('.aulyckanban-task-add-btn'), /height:\s*38px/);
	assert.match(rule('.aulyckanban-task-selection-toolbar'), /min-height:\s*38px/);
	const selectionButton = rule('.aulyckanban-task-selection-btn');
	assert.match(selectionButton, /width:\s*38px/);
	assert.match(selectionButton, /height:\s*38px/);
	assert.match(
		rule('.aulyckanban-kanban-container .aulyckanban-task-create-input'),
		/min-height:\s*38px/,
	);
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

test('fixed board footer reserves a reusable status region below scrollable content', () => {
	const footer = rule('.aulyckanban-board-footer');
	assert.match(footer, /flex:\s*none/);
	assert.match(footer, /min-height:\s*32px/);
	assert.match(footer, /border-top:\s*1px solid var\(--background-modifier-border\)/);
	assert.match(footer, /justify-content:\s*flex-end/);
	assert.match(rule('.aulyckanban-board-footer-status'), /justify-content:\s*flex-end/);
	assert.equal(rule('.aulyckanban-task-selected-count'), '');
});

test('task type and quadrant reorder use visible slots with compact drag previews', () => {
	const placeholder = rule('.aulyckanban-reorder-placeholder');
	assert.match(placeholder, /border:\s*2px dashed var\(--interactive-accent\)/);
	assert.match(placeholder, /background:\s*color-mix/);
	assert.match(rule('.aulyckanban-reorder-placeholder-horizontal'), /height:\s*30px/);
	assert.match(rule('.aulyckanban-reorder-placeholder-vertical'), /width:\s*100%/);
	const preview = rule('.aulyckanban-reorder-drag-preview');
	assert.match(preview, /max-width:\s*150px/);
	assert.match(preview, /height:\s*30px/);
	assert.match(preview, /pointer-events:\s*none/);
});

test('task metadata stacks source above a single-line date and time at the left edge', () => {
	assert.match(rule('.aulyckanban-task-meta-row'), /align-items:\s*flex-end/);
	assert.match(rule(".aulyckanban-task-meta-row[draggable='true']"), /cursor:\s*grab/);
	const details = rule('.aulyckanban-task-meta-details');
	assert.match(details, /flex-direction:\s*column/);
	assert.match(details, /align-items:\s*flex-start/);
	const time = rule('.aulyckanban-task-time');
	assert.doesNotMatch(time, /flex-direction:\s*column/);
	assert.match(time, /white-space:\s*nowrap/);
	assert.match(rule('.aulyckanban-task-content'), /cursor:\s*text/);
	assert.equal(rule(".aulyckanban-task[draggable='true']"), '');
});
