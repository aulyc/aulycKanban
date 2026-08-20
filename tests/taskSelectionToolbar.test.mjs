import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

class MockElement {
	constructor(options = {}) {
		this.children = [];
		this.listeners = new Map();
		this.classes = new Set(
			String(options.cls ?? '')
				.split(/\s+/)
				.filter(Boolean),
		);
		this.disabled = false;
		this.textContent = options.text ?? '';
	}

	createEl(_tagName, options = {}) {
		const child = new MockElement(options);
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	createSpan(options = {}) {
		return this.createEl('span', options);
	}

	addEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push(listener);
		this.listeners.set(name, listeners);
	}
}

const { createTaskSelectionButtons } = await loadSourceModule(
	new URL('../src/ui/TaskSelectionToolbar.ts', import.meta.url),
	{
		label: 'task-selection-toolbar',
		mocks: {
			obsidian: {
				setIcon: (element, icon) => {
					element.icon = icon;
				},
			},
			'../i18n': { t: (key) => key },
			'../utils/dom': {
				appendAccessibleLabel: (element, label) => element.createSpan({ text: label }),
			},
		},
	},
);

test('shared selection buttons use the ordinary cancel and select-all contract', () => {
	const events = [];
	const parent = new MockElement();
	const { cancelButton, selectionButton } = createTaskSelectionButtons(parent, {
		active: true,
		hasItems: true,
		allSelected: false,
		cancelClass: 'custom-cancel',
		selectionClass: 'custom-select',
		onCancel: () => events.push('cancel'),
		onSelect: () => events.push('select'),
	});

	assert.deepEqual(parent.children, [cancelButton, selectionButton]);
	assert.equal(cancelButton.classes.has('aulyckanban-task-selection-btn'), true);
	assert.equal(cancelButton.classes.has('custom-cancel'), true);
	assert.equal(cancelButton.icon, 'x');
	assert.equal(cancelButton.disabled, false);
	assert.equal(cancelButton.children[0].textContent, 'task.select.cancel');
	assert.equal(selectionButton.classes.has('aulyckanban-task-selection-btn'), true);
	assert.equal(selectionButton.classes.has('custom-select'), true);
	assert.equal(selectionButton.icon, 'list-checks');
	assert.equal(selectionButton.disabled, false);
	assert.equal(selectionButton.children[0].textContent, 'task.select.all');

	cancelButton.listeners.get('click')[0]();
	selectionButton.listeners.get('click')[0]();
	assert.deepEqual(events, ['cancel', 'select']);
});

test('shared selection buttons disable empty entry and expose clear-all only when complete', () => {
	const emptyParent = new MockElement();
	const empty = createTaskSelectionButtons(emptyParent, {
		active: false,
		hasItems: false,
		allSelected: false,
		onCancel() {},
		onSelect() {},
	});
	assert.equal(empty.cancelButton.disabled, true);
	assert.equal(empty.selectionButton.disabled, true);
	assert.equal(empty.selectionButton.icon, 'list-checks');
	assert.equal(empty.selectionButton.children[0].textContent, 'task.select.mode');

	const completeParent = new MockElement();
	const complete = createTaskSelectionButtons(completeParent, {
		active: true,
		hasItems: true,
		allSelected: true,
		onCancel() {},
		onSelect() {},
	});
	assert.equal(complete.selectionButton.icon, 'list-x');
	assert.equal(complete.selectionButton.children[0].textContent, 'task.select.clearAll');
});
