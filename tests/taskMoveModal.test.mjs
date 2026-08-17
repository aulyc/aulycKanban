import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

class MockElement {
	constructor(tagName = 'div', options = {}) {
		this.tagName = tagName;
		this.children = [];
		this.classes = new Set(
			String(options.cls ?? '')
				.split(/\s+/)
				.filter(Boolean),
		);
		this.textContent = options.text ?? '';
		this.attributes = { ...(options.attr ?? {}) };
		this.listeners = new Map();
		this.value = '';
		this.disabled = false;
	}

	append(child) {
		child.parentElement = this;
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

	addClass(value) {
		this.classes.add(value);
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
}

class MockModal {
	constructor(app) {
		this.app = app;
		this.contentEl = new MockElement();
		this.modalEl = new MockElement();
		this.title = '';
		this.closeCount = 0;
	}

	setTitle(title) {
		this.title = title;
	}

	open() {
		this.onOpen();
	}

	close() {
		this.closeCount += 1;
		this.onClose();
	}
}

const copy = {
	'task.move.title': '移动任务',
	'task.move.count': '移动 {count} 项任务',
	'task.move.keepView': '保持各自原类型',
	'task.move.keepColumn': '保持各自原象限',
	'task.target.view': '任务类型',
	'task.target.column': '象限',
	'task.move.confirm': '移动',
	cancel: '取消',
};

const { TaskMoveModal } = await loadSourceModule(
	new URL('../src/ui/TaskMoveModal.ts', import.meta.url),
	{
		label: 'task-move-modal',
		mocks: {
			obsidian: { App: class {}, Modal: MockModal },
			'../i18n': { t: (key) => copy[key] ?? key },
		},
	},
);

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function dispatch(element, name) {
	for (const listener of element.listeners.get(name) ?? []) listener();
}

const destinations = {
	views: [
		{ id: 'work', title: '工作任务' },
		{ id: 'personal', title: '个人任务' },
	],
	columns: [
		{ id: 'base', title: '基础' },
		{ id: 'important', title: '重要不紧急' },
	],
};

test('single-task move starts at its current coordinate and enables after one dimension changes', () => {
	const moves = [];
	const modal = new TaskMoveModal(
		{},
		{
			...destinations,
			taskCount: 1,
			initialViewId: 'work',
			initialColumnId: 'base',
			onMove: (target) => moves.push(target),
		},
	);
	modal.open();

	const selects = descendants(modal.contentEl).filter((element) => element.tagName === 'select');
	const buttons = descendants(modal.contentEl).filter((element) => element.tagName === 'button');
	assert.deepEqual(
		selects.map((select) => select.value),
		['work', 'base'],
	);
	assert.equal(buttons[1].disabled, true);

	selects[1].value = 'important';
	dispatch(selects[1], 'change');
	assert.equal(buttons[1].disabled, false);
	dispatch(buttons[1], 'click');
	assert.deepEqual(moves, [{ targetViewId: 'work', targetColumnId: 'important' }]);
	assert.equal(modal.closeCount, 1);
});

test('mixed batch defaults to keeping both dimensions and can set only one common target', () => {
	const moves = [];
	const modal = new TaskMoveModal(
		{},
		{
			...destinations,
			taskCount: 3,
			initialViewId: null,
			initialColumnId: null,
			onMove: (target) => moves.push(target),
		},
	);
	modal.open();

	const selects = descendants(modal.contentEl).filter((element) => element.tagName === 'select');
	const buttons = descendants(modal.contentEl).filter((element) => element.tagName === 'button');
	assert.deepEqual(
		selects.map((select) => select.value),
		['', ''],
	);
	assert.equal(selects[0].children[0].textContent, '保持各自原类型');
	assert.equal(selects[1].children[0].textContent, '保持各自原象限');
	assert.equal(buttons[1].disabled, true);

	selects[0].value = 'personal';
	dispatch(selects[0], 'change');
	dispatch(buttons[1], 'click');
	assert.deepEqual(moves, [{ targetViewId: 'personal', targetColumnId: undefined }]);
});
