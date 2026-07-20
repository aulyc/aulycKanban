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
		this.listeners = new Map();
	}

	append(child) {
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	createDiv(options = {}) {
		return this.append(new MockElement('div', options));
	}

	createEl(tagName, options = {}) {
		return this.append(new MockElement(tagName, options));
	}

	appendText(value) {
		this.textContent += value;
	}

	addClass(value) {
		this.classes.add(value);
	}

	empty() {
		this.children = [];
		this.textContent = '';
	}

	addEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push(listener);
		this.listeners.set(name, listeners);
	}
}

class MockModal {
	constructor(app) {
		this.app = app;
		this.contentEl = new MockElement('div');
		this.modalEl = new MockElement('div');
		this.closeCount = 0;
	}

	open() {
		this.onOpen();
	}

	close() {
		this.closeCount += 1;
		this.onClose();
	}
}

const translations = {
	confirm: '确认',
	cancel: '取消',
	'settings.clear.warning': '此操作将清除全部看板数据',
	'settings.clear.suggestion': '建议先导出备份',
	'settings.clear.backupFirst': '备份数据',
	'settings.clear.confirm': '确认清除',
};
const mocks = {
	obsidian: { App: class {}, Modal: MockModal },
	'../i18n': { t: (key) => translations[key] ?? key },
};
const [{ ConfirmModal }, { ClearDataModal }] = await Promise.all([
	loadSourceModule(new URL('../src/ui/ConfirmModal.ts', import.meta.url), {
		label: 'confirm-modal',
		mocks,
	}),
	loadSourceModule(new URL('../src/ui/ClearDataModal.ts', import.meta.url), {
		label: 'clear-data-modal',
		mocks,
	}),
]);

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function buttons(modal) {
	return descendants(modal.contentEl).filter((element) => element.tagName === 'button');
}

function click(element) {
	for (const listener of element.listeners.get('click') ?? []) listener();
}

test('confirm modal renders default copy and cancellation closes without confirming', () => {
	let confirmations = 0;
	const modal = new ConfirmModal(
		{},
		{
			message: '继续执行吗？',
			onConfirm: () => {
				confirmations += 1;
			},
		},
	);

	modal.open();

	assert.equal(modal.modalEl.classes.has('aulyckanban-modal-clean'), true);
	assert.equal(modal.modalEl.classes.has('aulyckanban-confirm-modal'), true);
	assert.equal(modal.contentEl.children[0].textContent, '继续执行吗？');
	assert.deepEqual(
		buttons(modal).map((button) => button.textContent),
		['取消', '确认'],
	);
	assert.equal(buttons(modal)[1].classes.has('mod-cta'), true);
	assert.equal(buttons(modal)[1].classes.has('mod-warning'), false);

	click(buttons(modal)[0]);
	assert.equal(confirmations, 0);
	assert.equal(modal.closeCount, 1);
	assert.equal(modal.contentEl.children.length, 0);
});

test('destructive confirm modal uses custom labels, confirms once, and clears on close', () => {
	let confirmations = 0;
	const modal = new ConfirmModal(
		{},
		{
			message: '确定删除吗？',
			confirmText: '删除',
			cancelText: '返回',
			isDestructive: true,
			onConfirm: () => {
				confirmations += 1;
			},
		},
	);

	modal.open();
	const renderedButtons = buttons(modal);
	assert.deepEqual(
		renderedButtons.map((button) => button.textContent),
		['返回', '删除'],
	);
	assert.equal(renderedButtons[1].classes.has('mod-warning'), true);

	click(renderedButtons[1]);
	assert.equal(confirmations, 1);
	assert.equal(modal.closeCount, 1);
	assert.equal(modal.contentEl.children.length, 0);
});

test('clear-data modal keeps the dialog open after backup and closes after clearing', () => {
	let backups = 0;
	let clears = 0;
	const modal = new ClearDataModal(
		{},
		{
			onBackup: () => {
				backups += 1;
			},
			onConfirmClear: () => {
				clears += 1;
			},
		},
	);

	modal.open();
	assert.equal(modal.modalEl.classes.has('aulyckanban-modal-clean'), true);
	assert.equal(modal.modalEl.classes.has('aulyckanban-confirm-modal'), false);
	assert.equal(modal.contentEl.children[0].textContent, translations['settings.clear.warning']);
	const suggestion = descendants(modal.contentEl).find((element) =>
		element.classes.has('aulyckanban-clear-suggestion'),
	);
	assert.equal(suggestion.children[0].textContent, '💡 ');
	assert.equal(suggestion.textContent, translations['settings.clear.suggestion']);
	const renderedButtons = buttons(modal);
	assert.deepEqual(
		renderedButtons.map((button) => button.textContent),
		['备份数据', '取消', '确认清除'],
	);

	click(renderedButtons[0]);
	assert.equal(backups, 1);
	assert.equal(clears, 0);
	assert.equal(modal.closeCount, 0);
	assert.notEqual(modal.contentEl.children.length, 0);

	click(renderedButtons[2]);
	assert.equal(backups, 1);
	assert.equal(clears, 1);
	assert.equal(modal.closeCount, 1);
	assert.equal(modal.contentEl.children.length, 0);
});

test('clear-data cancellation closes without backing up or clearing', () => {
	let backups = 0;
	let clears = 0;
	const modal = new ClearDataModal(
		{},
		{
			onBackup: () => {
				backups += 1;
			},
			onConfirmClear: () => {
				clears += 1;
			},
		},
	);

	modal.open();
	click(buttons(modal)[1]);

	assert.equal(backups, 0);
	assert.equal(clears, 0);
	assert.equal(modal.closeCount, 1);
	assert.equal(modal.contentEl.children.length, 0);
});
