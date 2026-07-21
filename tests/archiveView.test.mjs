import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

class MockElement {
	constructor(tagName, options = {}) {
		this.tagName = tagName;
		this.children = [];
		this.dataset = {};
		this.listeners = new Map();
		this.attributes = { ...(options.attr ?? {}) };
		this.classes = new Set(
			String(options.cls ?? '')
				.split(/\s+/)
				.filter(Boolean),
		);
		this.textContent = options.text ?? '';
		this.value = '';
		this.checked = false;
		this.indeterminate = false;
		this.disabled = false;
		this.hidden = false;
		this.scrollTop = 0;
		this.selectionStart = 0;
		this.selectionEnd = 0;
		this.classList = { contains: (value) => this.classes.has(value) };
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

	add(option) {
		this.append(option);
	}

	empty() {
		this.children = [];
	}

	setText(value) {
		this.textContent = value;
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
	}

	addEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push(listener);
		this.listeners.set(name, listeners);
	}

	querySelector(selector) {
		if (!selector.startsWith('.')) return null;
		const className = selector.slice(1);
		return descendants(this).find((element) => element.classes.has(className)) ?? null;
	}

	closest(selector) {
		const tagNames = selector.split(',').map((value) => value.trim());
		for (let current = this; current; current = current.parentElement) {
			if (tagNames.includes(current.tagName)) return current;
		}
		return null;
	}

	getBoundingClientRect() {
		return { right: 100, bottom: 40 };
	}
}

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function byClass(root, className) {
	return descendants(root).filter((element) => element.classes.has(className));
}

const source = readFileSync(new URL('../src/ui/ArchiveView.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const { ArchiveView } = await loadSourceModule(
	new URL('../src/ui/ArchiveView.ts', import.meta.url),
	{
		label: 'archive-view',
		mocks: {
			obsidian: {
				setIcon: (element, icon) => {
					element.icon = icon;
				},
			},
			'../i18n': {
				t: (key) => (key === 'archive.delete.selectedCount' ? '已选 {count} 项' : key),
			},
			'./ConfirmModal': { ConfirmModal: class {} },
			'../utils/datetime': { formatDateTimeMinute: () => '2026/07/12 21:10' },
			'../utils/dom': {
				appendAccessibleLabel: (element, text) =>
					element.createSpan({
						cls: 'aulyckanban-accessible-label',
						text,
					}),
				setTextWithLineBreaks: (element, value) => {
					element.textContent = value;
				},
			},
			'../utils/task': {
				getArchivedAtIso: (value) => value.archivedAt,
				getArchivedAtTime: () => 1,
			},
			'../utils/taskQuery': {
				getTaskRefKey: (ref) => `${ref.viewId}:${ref.columnId}:${ref.task.id}`,
			},
			'./InlineInput': {
				createInlineInput: (parent, options) => {
					const input = parent.createEl('input', { cls: options.cls });
					input.value = options.initialValue ?? '';
					return input;
				},
			},
			'../constants': { ARCHIVE_UNCATEGORIZED_ID: '__other__' },
		},
	},
);

function createHarness() {
	const task = {
		id: 'archive-1',
		content: '已归档任务',
		sourceColumnId: 'periodic',
		archivedAt: '2026-07-12T21:10:00Z',
	};
	const boardData = {
		views: [
			{
				id: 'work',
				title: '工作任务',
				columns: [{ id: 'periodic', title: '周期任务' }],
			},
		],
	};
	const store = {
		getBoardData: () => boardData,
		getVisibleTaskRefs: () => [
			{
				viewId: 'work',
				viewTitle: '工作任务',
				columnId: 'periodic',
				columnTitle: '周期任务',
				task,
			},
		],
		getTaskViews: () => [{ id: 'work', title: '工作任务' }],
		getArchive: () => [task],
		getActiveColumnId: () => 'periodic',
		getArchiveColumnId: () => 'periodic',
		getSearchKeyword: () => '',
		dispatch: () => {},
	};
	const container = new MockElement('div');
	const documentRef = {
		activeElement: null,
		createElement: (tagName) => new MockElement(tagName),
	};
	globalThis.document = documentRef;
	globalThis.Element = MockElement;
	const archiveView = new ArchiveView(container, {}, store);
	archiveView.render();
	return { archiveView, container };
}

test('archive browse mode uses one compact toolbar and one-line card metadata', () => {
	const { container } = createHarness();

	assert.equal(byClass(container, 'aulyckanban-archive-toolbar-browse').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-search').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-sort-btn').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-filter-select').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-select-mode-btn').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-select-all-btn').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-delete-selected-btn').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-selected-count').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-toolbar-selection').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-task-meta').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-tag').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-restore-btn').length, 1);
	assert.equal(byClass(container, 'aulyckanban-task-content-completed').length, 0);
});

test('archive browse toolbar keeps sort, select, select-all, delete, and count in fixed order', () => {
	const { container } = createHarness();
	const toolbar = byClass(container, 'aulyckanban-archive-toolbar-browse')[0];
	const sortButton = byClass(toolbar, 'aulyckanban-archive-sort-btn')[0];
	const selectButton = byClass(toolbar, 'aulyckanban-archive-select-mode-btn')[0];
	const selectAllButton = byClass(toolbar, 'aulyckanban-archive-select-all-btn')[0];
	const deleteButton = byClass(toolbar, 'aulyckanban-archive-delete-selected-btn')[0];
	const selectedCount = byClass(toolbar, 'aulyckanban-archive-selected-count')[0];

	assert.deepEqual(toolbar.children, [
		sortButton,
		selectButton,
		selectAllButton,
		deleteButton,
		selectedCount,
	]);
	assert.equal(sortButton.icon, 'arrow-down-wide-narrow');
	assert.equal(selectButton.icon, 'list-checks');
	assert.equal(selectButton.textContent, '');
	assert.equal(
		byClass(selectButton, 'aulyckanban-accessible-label')[0].textContent,
		'archive.delete.mode',
	);
	assert.equal(selectAllButton.icon, 'check-check');
	assert.equal(
		byClass(selectAllButton, 'aulyckanban-accessible-label')[0].textContent,
		'archive.delete.selectAll',
	);
	assert.equal(deleteButton.icon, 'trash-2');
	assert.equal(deleteButton.disabled, true);
	assert.equal(
		byClass(selectedCount, 'aulyckanban-archive-selected-count-value')[0].textContent,
		'0',
	);

	const browseToolbarRule =
		css.match(/\.aulyckanban-archive-toolbar-browse\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(browseToolbarRule, /justify-content:\s*flex-start;/);

	const countRule = css.match(/\.aulyckanban-archive-selected-count\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(countRule, /margin-left:\s*auto;/);
	const countValueRule =
		css.match(/\.aulyckanban-archive-selected-count-value\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(countValueRule, /min-width:\s*3ch;/);
	assert.match(countValueRule, /text-align:\s*right;/);
	assert.match(countValueRule, /font-variant-numeric:\s*tabular-nums;/);
});

test('archive bidirectional sort button toggles newest and oldest order without a select menu', () => {
	const { container } = createHarness();
	const newestFirstButton = byClass(container, 'aulyckanban-archive-sort-btn')[0];

	assert.equal(newestFirstButton.icon, 'arrow-down-wide-narrow');
	assert.equal(newestFirstButton.attributes['aria-label'], undefined);
	assert.equal(newestFirstButton.attributes.title, undefined);
	assert.equal(
		byClass(newestFirstButton, 'aulyckanban-accessible-label')[0].textContent,
		'archive.sort.newest',
	);
	newestFirstButton.listeners.get('click')[0]();

	const oldestFirstButton = byClass(container, 'aulyckanban-archive-sort-btn')[0];
	assert.equal(oldestFirstButton.icon, 'arrow-up-narrow-wide');
	assert.equal(
		byClass(oldestFirstButton, 'aulyckanban-accessible-label')[0].textContent,
		'archive.sort.oldest',
	);
});

test('archive selection toolbar keeps aligned icon actions and hides restore actions', () => {
	const { container } = createHarness();
	const selectButton = byClass(container, 'aulyckanban-archive-select-mode-btn')[0];
	selectButton.listeners.get('click')[0]();

	assert.equal(byClass(container, 'aulyckanban-archive-toolbar-browse').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-toolbar-selection').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-search').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-restore-btn').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-more-btn').length, 0);
	const toolbar = byClass(container, 'aulyckanban-archive-toolbar-selection')[0];
	const sortButton = byClass(container, 'aulyckanban-archive-sort-btn')[0];
	const cancelButton = byClass(container, 'aulyckanban-archive-cancel-selection-btn')[0];
	const selectAllButton = byClass(container, 'aulyckanban-archive-select-all-btn')[0];
	const deleteButton = byClass(container, 'aulyckanban-archive-delete-selected-btn')[0];
	const selectedCount = byClass(container, 'aulyckanban-archive-selected-count')[0];
	assert.deepEqual(toolbar.children, [
		sortButton,
		cancelButton,
		selectAllButton,
		deleteButton,
		selectedCount,
	]);
	assert.equal(deleteButton.icon, 'trash-2');
	assert.equal(deleteButton.textContent, '');
	assert.equal(
		byClass(deleteButton, 'aulyckanban-accessible-label')[0].textContent,
		'archive.delete.selected',
	);
	assert.equal(deleteButton.disabled, true);
	assert.equal(cancelButton.icon, 'list-x');
	assert.equal(cancelButton.textContent, '');
	assert.equal(
		byClass(cancelButton, 'aulyckanban-accessible-label')[0].textContent,
		'archive.delete.cancel',
	);
	assert.equal(selectAllButton.icon, 'check-check');
	assert.equal(selectAllButton.disabled, false);
	assert.equal(
		byClass(selectAllButton, 'aulyckanban-accessible-label')[0].textContent,
		'archive.delete.selectAll',
	);
	assert.equal(sortButton.icon, 'arrow-down-wide-narrow');
	sortButton.listeners.get('click')[0]();
	assert.equal(byClass(container, 'aulyckanban-archive-toolbar-selection').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-sort-btn')[0].icon, 'arrow-up-narrow-wide');
});

test('archive selection mode has one explicit delete path and an unboxed toolbar', () => {
	assert.doesNotMatch(
		source,
		/showFilteredDeleteMenu|archive\.delete\.filtered|archive\.confirm\.deleteFiltered/,
	);

	const toolbarRule = css.match(/\.aulyckanban-archive-toolbar-selection\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(toolbarRule, /border:\s*0;/);
	assert.match(toolbarRule, /background:\s*transparent;/);

	const disabledDeleteRule =
		css.match(/\.aulyckanban-archive-delete-selected-btn:disabled\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(disabledDeleteRule, /border-color:\s*var\(--background-modifier-border\);/);
	assert.match(disabledDeleteRule, /background:\s*var\(--interactive-normal\);/);

	const deleteRule =
		css.match(/\.aulyckanban-archive-delete-selected-btn\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.doesNotMatch(deleteRule, /margin-left:\s*auto;/);
	assert.doesNotMatch(source, /selectAllCheckbox|aulyckanban-archive-select-all[^-]/);
});

test('select-all and clear-all toggle repeatedly while preserving the toolbar slots', () => {
	const { container } = createHarness();
	byClass(container, 'aulyckanban-archive-select-all-btn')[0].listeners.get('click')[0]();

	assert.equal(byClass(container, 'aulyckanban-archive-toolbar-selection').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-task-selected').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-selected-count-value')[0].textContent, '1');
	assert.equal(byClass(container, 'aulyckanban-archive-delete-selected-btn')[0].disabled, false);

	byClass(container, 'aulyckanban-archive-clear-all-btn')[0].listeners.get('click')[0]();
	assert.equal(byClass(container, 'aulyckanban-archive-toolbar-selection').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-task-selected').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-selected-count-value')[0].textContent, '0');
	assert.equal(byClass(container, 'aulyckanban-archive-delete-selected-btn')[0].disabled, true);

	const selectAllAgain = byClass(container, 'aulyckanban-archive-select-all-btn')[0];
	assert.equal(selectAllAgain.disabled, false);
	assert.equal(selectAllAgain.icon, 'check-check');
	assert.equal(
		byClass(selectAllAgain, 'aulyckanban-accessible-label')[0].textContent,
		'archive.delete.selectAll',
	);
	selectAllAgain.listeners.get('click')[0]();
	assert.equal(byClass(container, 'aulyckanban-archive-task-selected').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-selected-count-value')[0].textContent, '1');
	assert.equal(byClass(container, 'aulyckanban-archive-delete-selected-btn')[0].disabled, false);
});

test('archive card selection checkbox occupies the restore action position', () => {
	const { container } = createHarness();
	const browseTop = byClass(container, 'aulyckanban-archive-task-top')[0];
	const browseMain = byClass(browseTop, 'aulyckanban-archive-task-main')[0];
	const browseActions = byClass(browseTop, 'aulyckanban-archive-task-actions')[0];
	const restoreButton = byClass(browseActions, 'aulyckanban-archive-restore-btn')[0];
	assert.deepEqual(browseTop.children, [browseMain, browseActions]);
	assert.equal(restoreButton.parentElement, browseActions);

	byClass(container, 'aulyckanban-archive-select-mode-btn')[0].listeners.get('click')[0]();
	const selectingTop = byClass(container, 'aulyckanban-archive-task-top')[0];
	const selectingMain = byClass(selectingTop, 'aulyckanban-archive-task-main')[0];
	const selectingActions = byClass(selectingTop, 'aulyckanban-archive-task-actions')[0];
	const checkboxLabel = byClass(selectingActions, 'aulyckanban-archive-select-label')[0];
	assert.deepEqual(selectingTop.children, [selectingMain, selectingActions]);
	assert.equal(checkboxLabel.parentElement, selectingActions);

	const card = byClass(container, 'aulyckanban-archive-task')[0];
	card.listeners.get('click')[0]({ target: card });

	assert.equal(byClass(container, 'aulyckanban-archive-task-selected').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-selected-count-value')[0].textContent, '1');
	assert.equal(byClass(container, 'aulyckanban-archive-delete-selected-btn')[0].disabled, false);
});

test('archive card restore and selection controls share one centered action slot', () => {
	const actionsRule = css.match(/\.aulyckanban-archive-task-actions\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(actionsRule, /display:\s*grid;/);
	assert.match(actionsRule, /place-items:\s*center;/);
	assert.match(actionsRule, /width:\s*24px;/);
	assert.match(actionsRule, /height:\s*24px;/);

	for (const selector of [
		'.aulyckanban-archive-select-label',
		'.aulyckanban-archive-restore-btn',
	]) {
		const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const declarations = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
		assert.match(declarations, /display:\s*grid;/);
		assert.match(declarations, /place-items:\s*center;/);
		assert.match(declarations, /width:\s*24px;/);
		assert.match(declarations, /height:\s*24px;/);
	}

	const checkboxRule = css.match(/\.aulyckanban-archive-select-checkbox\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(checkboxRule, /display:\s*block;/);
});

test('selected archive cards keep their normal surface and use only a red border', () => {
	const selectedRule =
		css.match(
			/\.aulyckanban-archive-task-selected\s*,\s*\.aulyckanban-archive-task-selected:hover\s*\{([^}]*)\}/,
		)?.[1] ?? '';

	assert.match(selectedRule, /border-color:\s*var\(--text-error\);/);
	assert.match(selectedRule, /background:\s*var\(--background-secondary\);/);
	assert.doesNotMatch(selectedRule, /background:\s*color-mix\(/);
});
