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
		this.focusCalls = [];
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

	focus(options) {
		this.focusCalls.push(options);
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
let activeModals = [];
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
				t: (key) => {
					if (key === 'task.select.count') return '已选 {count} 项';
					if (key === 'archive.confirm.deleteSelected') return '确认删除 {count} 项';
					return key;
				},
			},
			'./ConfirmModal': {
				ConfirmModal: class {
					constructor(_app, options) {
						this.options = options;
						activeModals.push(this);
					}
					open() {
						this.opened = true;
					}
				},
			},
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

function createHarness(storeOverrides = {}) {
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
		getTaskTypeScope: () => 'current',
		getCurrentView: () => 'work',
		getColumnScope: () => 'current',
		getSearchKeyword: () => '',
		dispatch: () => {},
		...storeOverrides,
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

test('archive browse mode uses one compact toolbar and shared card metadata', () => {
	const { container } = createHarness();

	assert.equal(byClass(container, 'aulyckanban-archive-toolbar').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-search').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-sort-btn').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-filter-select').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-select-mode-btn').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-select-all-btn').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-delete-selected-btn').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-selected-count').length, 0);
	assert.equal(byClass(container, 'aulyckanban-task-meta-row').length, 1);
	assert.equal(byClass(container, 'aulyckanban-task-meta-details').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-tag').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-restore-btn').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-task-delete').length, 1);
	assert.equal(byClass(container, 'aulyckanban-task-content-completed').length, 0);
});

test('archive card source labels follow the same aggregate scope rules as ordinary cards', () => {
	const current = createHarness().container;
	assert.equal(byClass(current, 'aulyckanban-task-source').length, 0);
	assert.equal(byClass(current, 'aulyckanban-archive-meta-item').length, 0);

	const allTypes = createHarness({ getTaskTypeScope: () => 'all' }).container;
	assert.equal(byClass(allTypes, 'aulyckanban-task-source')[0].textContent, '工作任务');

	const allColumns = createHarness({ getColumnScope: () => 'all' }).container;
	assert.equal(byClass(allColumns, 'aulyckanban-task-source')[0].textContent, '周期任务');

	const allSources = createHarness({
		getTaskTypeScope: () => 'all',
		getColumnScope: () => 'all',
	}).container;
	assert.equal(
		byClass(allSources, 'aulyckanban-task-source')[0].textContent,
		'工作任务 · 周期任务',
	);
});

test('archive toolbar keeps sort, permanent delete, cancel, and select-all in fixed order', () => {
	const { container } = createHarness();
	const toolbar = byClass(container, 'aulyckanban-archive-toolbar')[0];
	const sortButton = byClass(toolbar, 'aulyckanban-archive-sort-btn')[0];
	const deleteButton = byClass(toolbar, 'aulyckanban-archive-delete-selected-btn')[0];
	const cancelButton = byClass(toolbar, 'aulyckanban-archive-cancel-selection-btn')[0];
	const selectButton = byClass(toolbar, 'aulyckanban-archive-select-mode-btn')[0];

	assert.deepEqual(toolbar.children, [sortButton, deleteButton, cancelButton, selectButton]);
	assert.equal(sortButton.icon, 'arrow-down-wide-narrow');
	assert.equal(deleteButton.icon, 'trash-2');
	assert.equal(deleteButton.disabled, true);
	assert.equal(cancelButton.icon, 'x');
	assert.equal(cancelButton.disabled, true);
	assert.equal(selectButton.icon, 'list-checks');
	assert.equal(selectButton.textContent, '');
	assert.equal(
		byClass(selectButton, 'aulyckanban-accessible-label')[0].textContent,
		'task.select.mode',
	);
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

test('archive selection reuses the ordinary cancel and select-all behavior', () => {
	const { container } = createHarness();
	const selectButton = byClass(container, 'aulyckanban-archive-select-mode-btn')[0];
	selectButton.listeners.get('click')[0]();

	assert.equal(byClass(container, 'aulyckanban-archive-search').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-restore-btn').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-task-delete').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-more-btn').length, 0);
	const toolbar = byClass(container, 'aulyckanban-archive-toolbar')[0];
	const sortButton = byClass(container, 'aulyckanban-archive-sort-btn')[0];
	const cancelButton = byClass(container, 'aulyckanban-archive-cancel-selection-btn')[0];
	const deleteButton = byClass(container, 'aulyckanban-archive-delete-selected-btn')[0];
	const selectionButton = byClass(container, 'aulyckanban-archive-select-mode-btn')[0];
	assert.deepEqual(toolbar.children, [sortButton, deleteButton, cancelButton, selectionButton]);
	assert.equal(deleteButton.icon, 'trash-2');
	assert.equal(deleteButton.textContent, '');
	assert.equal(
		byClass(deleteButton, 'aulyckanban-accessible-label')[0].textContent,
		'archive.delete.selected',
	);
	assert.equal(deleteButton.disabled, true);
	assert.equal(cancelButton.icon, 'x');
	assert.equal(cancelButton.disabled, false);
	assert.equal(cancelButton.textContent, '');
	assert.equal(
		byClass(cancelButton, 'aulyckanban-accessible-label')[0].textContent,
		'task.select.cancel',
	);
	assert.equal(selectionButton.icon, 'list-checks');
	assert.equal(selectionButton.disabled, false);
	assert.equal(
		byClass(selectionButton, 'aulyckanban-accessible-label')[0].textContent,
		'task.select.all',
	);
	assert.equal(sortButton.icon, 'arrow-down-wide-narrow');
	sortButton.listeners.get('click')[0]();
	assert.equal(byClass(container, 'aulyckanban-archive-sort-btn')[0].icon, 'arrow-up-narrow-wide');
});

test('archive selection mode has one explicit bulk-delete path and an unboxed toolbar', () => {
	assert.doesNotMatch(
		source,
		/showFilteredDeleteMenu|archive\.delete\.filtered|archive\.confirm\.deleteFiltered/,
	);

	const toolbarRule = css.match(/\.aulyckanban-archive-toolbar\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(toolbarRule, /border:\s*0;/);
	assert.match(toolbarRule, /background:\s*transparent;/);

	const disabledDeleteRule =
		css.match(/\.aulyckanban-archive-delete-selected-btn:disabled\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(disabledDeleteRule, /border-color:\s*var\(--background-modifier-border\);/);
	assert.match(disabledDeleteRule, /background:\s*var\(--interactive-normal\);/);

	const deleteRule =
		css.match(/\.aulyckanban-archive-delete-selected-btn\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(deleteRule, /margin-left:\s*auto;/);
	assert.doesNotMatch(source, /selectAllCheckbox|aulyckanban-archive-select-all[^-]/);
});

test('select-all and clear-all toggle through one shared selection button', () => {
	const { container } = createHarness();
	byClass(container, 'aulyckanban-archive-select-mode-btn')[0].listeners.get('click')[0]();
	assert.equal(byClass(container, 'aulyckanban-archive-task-selected').length, 0);
	byClass(container, 'aulyckanban-archive-select-mode-btn')[0].listeners.get('click')[0]();

	assert.equal(byClass(container, 'aulyckanban-archive-task-selected').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-delete-selected-btn')[0].disabled, false);
	assert.equal(byClass(container, 'aulyckanban-archive-select-mode-btn')[0].icon, 'list-x');

	byClass(container, 'aulyckanban-archive-select-mode-btn')[0].listeners.get('click')[0]();
	assert.equal(byClass(container, 'aulyckanban-archive-task-selected').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-delete-selected-btn')[0].disabled, true);

	const selectAllAgain = byClass(container, 'aulyckanban-archive-select-mode-btn')[0];
	assert.equal(selectAllAgain.disabled, false);
	assert.equal(selectAllAgain.icon, 'list-checks');
	assert.equal(
		byClass(selectAllAgain, 'aulyckanban-accessible-label')[0].textContent,
		'task.select.all',
	);
	selectAllAgain.listeners.get('click')[0]();
	assert.equal(byClass(container, 'aulyckanban-archive-task-selected').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-delete-selected-btn')[0].disabled, false);
});

test('archive card selection checkbox occupies the restore action position', () => {
	const { container } = createHarness();
	const browseCard = byClass(container, 'aulyckanban-archive-task')[0];
	const browseMiddle = byClass(browseCard, 'aulyckanban-task-middle')[0];
	const browseContent = byClass(browseMiddle, 'aulyckanban-task-content')[0];
	const browseFooter = byClass(browseCard, 'aulyckanban-task-meta-row')[0];
	const browseMeta = byClass(browseFooter, 'aulyckanban-task-meta-details')[0];
	const browseActions = byClass(browseFooter, 'aulyckanban-archive-task-actions')[0];
	const restoreButton = byClass(browseActions, 'aulyckanban-archive-restore-btn')[0];
	const deleteButton = byClass(browseActions, 'aulyckanban-archive-task-delete')[0];
	assert.deepEqual(browseCard.children, [browseMiddle]);
	assert.deepEqual(browseMiddle.children, [browseContent, browseFooter]);
	assert.deepEqual(browseFooter.children, [browseMeta, browseActions]);
	assert.deepEqual(browseActions.children, [restoreButton, deleteButton]);
	assert.equal(restoreButton.parentElement, browseActions);
	assert.equal(deleteButton.parentElement, browseActions);

	byClass(container, 'aulyckanban-archive-select-mode-btn')[0].listeners.get('click')[0]();
	const selectingCard = byClass(container, 'aulyckanban-archive-task')[0];
	const selectingMiddle = byClass(selectingCard, 'aulyckanban-task-middle')[0];
	const selectingContent = byClass(selectingMiddle, 'aulyckanban-task-content')[0];
	const selectingFooter = byClass(selectingCard, 'aulyckanban-task-meta-row')[0];
	const selectingMeta = byClass(selectingFooter, 'aulyckanban-task-meta-details')[0];
	const selectingActions = byClass(selectingFooter, 'aulyckanban-archive-task-actions')[0];
	const checkboxLabel = byClass(selectingActions, 'aulyckanban-archive-select-label')[0];
	const checkbox = byClass(selectingActions, 'aulyckanban-archive-select-checkbox')[0];
	assert.deepEqual(selectingCard.children, [selectingMiddle]);
	assert.deepEqual(selectingMiddle.children, [selectingContent, selectingFooter]);
	assert.deepEqual(selectingFooter.children, [selectingMeta, selectingActions]);
	assert.equal(checkboxLabel.parentElement, selectingActions);
	assert.equal(checkboxLabel.classes.has('aulyckanban-task-select-label'), true);
	assert.equal(checkbox.classes.has('aulyckanban-task-select-checkbox'), true);

	const card = byClass(container, 'aulyckanban-archive-task')[0];
	card.listeners.get('click')[0]({ target: card });

	assert.equal(byClass(container, 'aulyckanban-archive-task-selected').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-delete-selected-btn')[0].disabled, false);
});

test('archive card restore, delete, and selection controls reuse the ordinary action slot', () => {
	const footerRule = css.match(/\.aulyckanban-task-meta-row\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(footerRule, /display:\s*flex;/);
	assert.match(footerRule, /align-items:\s*flex-end;/);
	assert.match(footerRule, /justify-content:\s*space-between;/);

	const actionsRule = css.match(/\.aulyckanban-archive-task-actions\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.doesNotMatch(actionsRule, /display:\s*grid;/);
	assert.doesNotMatch(actionsRule, /width:\s*24px;/);

	for (const selector of ['.aulyckanban-archive-restore-btn', '.aulyckanban-archive-task-delete']) {
		const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const declarations = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
		assert.match(declarations, /width:\s*18px;/);
		assert.match(declarations, /height:\s*18px;/);
	}

	assert.equal(css.match(/\.aulyckanban-archive-select-checkbox\s*\{([^}]*)\}/)?.[1] ?? '', '');
	const checkboxRule = css.match(/\.aulyckanban-task-select-checkbox\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(checkboxRule, /width:\s*16px;/);
	assert.match(checkboxRule, /height:\s*16px;/);
});

test('archive selection count is announced only in the shared board footer', () => {
	const { archiveView, container } = createHarness();
	const footerStatus = new MockElement('div');
	archiveView.setStatusEl(footerStatus);
	archiveView.render();

	assert.equal(footerStatus.children.length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-selected-count').length, 0);
	byClass(container, 'aulyckanban-archive-select-mode-btn')[0].listeners.get('click')[0]();
	assert.equal(footerStatus.children[0].textContent, '已选 0 项');

	const card = byClass(container, 'aulyckanban-archive-task')[0];
	card.listeners.get('click')[0]({ target: card });
	assert.equal(footerStatus.children[0].textContent, '已选 1 项');

	byClass(container, 'aulyckanban-archive-cancel-selection-btn')[0].listeners.get('click')[0]();
	assert.equal(footerStatus.children.length, 0);
});

test('one archived card can be permanently deleted by its exact task reference', () => {
	activeModals = [];
	const actions = [];
	const { container } = createHarness({ dispatch: (action) => actions.push(action) });
	const deleteButton = byClass(container, 'aulyckanban-archive-task-delete')[0];
	deleteButton.listeners.get('click')[0]({ stopPropagation() {} });

	assert.equal(activeModals.length, 1);
	assert.equal(activeModals[0].opened, true);
	assert.equal(activeModals[0].options.isDestructive, true);
	assert.equal(activeModals[0].options.message, 'archive.confirm.delete');
	activeModals[0].options.onConfirm();
	assert.deepEqual(actions, [
		{
			type: 'DELETE_ARCHIVE_TASKS',
			payload: { tasks: [{ viewId: 'work', taskId: 'archive-1' }] },
		},
	]);
});

test('bulk permanent delete confirms and dispatches the exact selected references', () => {
	activeModals = [];
	const actions = [];
	const { container } = createHarness({ dispatch: (action) => actions.push(action) });
	byClass(container, 'aulyckanban-archive-select-mode-btn')[0].listeners.get('click')[0]();
	byClass(container, 'aulyckanban-archive-select-mode-btn')[0].listeners.get('click')[0]();
	byClass(container, 'aulyckanban-archive-delete-selected-btn')[0].listeners.get('click')[0]();

	assert.equal(activeModals[0].options.message, '确认删除 1 项');
	assert.equal(activeModals[0].options.isDestructive, true);
	activeModals[0].options.onConfirm();
	assert.deepEqual(actions, [
		{
			type: 'DELETE_ARCHIVE_TASKS',
			payload: { tasks: [{ viewId: 'work', taskId: 'archive-1' }] },
		},
	]);
});

test('sorting preserves archive selection while a scope change clears it', () => {
	let keyword = '';
	const { archiveView, container } = createHarness({ getSearchKeyword: () => keyword });
	const footerStatus = new MockElement('div');
	archiveView.setStatusEl(footerStatus);
	archiveView.render();
	byClass(container, 'aulyckanban-archive-select-mode-btn')[0].listeners.get('click')[0]();
	const card = byClass(container, 'aulyckanban-archive-task')[0];
	card.listeners.get('click')[0]({ target: card });

	byClass(container, 'aulyckanban-archive-sort-btn')[0].listeners.get('click')[0]();
	assert.equal(byClass(container, 'aulyckanban-archive-task-selected').length, 1);
	assert.equal(footerStatus.children[0].textContent, '已选 1 项');

	keyword = '新的范围';
	archiveView.render();
	assert.equal(byClass(container, 'aulyckanban-archive-task-selected').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-restore-btn').length, 1);
	assert.equal(footerStatus.children.length, 0);
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
