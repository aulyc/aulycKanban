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
	assert.equal(byClass(container, 'aulyckanban-archive-toolbar-selection').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-task-meta').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-tag').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-restore-btn').length, 1);
	assert.equal(byClass(container, 'aulyckanban-task-content-completed').length, 0);
});

test('archive browse actions place icon selection before bidirectional sort at the right edge', () => {
	const { container } = createHarness();
	const toolbar = byClass(container, 'aulyckanban-archive-toolbar-browse')[0];
	const selectButton = byClass(toolbar, 'aulyckanban-archive-select-mode-btn')[0];
	const sortButton = byClass(toolbar, 'aulyckanban-archive-sort-btn')[0];

	assert.deepEqual(toolbar.children, [selectButton, sortButton]);
	assert.equal(selectButton.icon, 'list-checks');
	assert.equal(selectButton.textContent, '');
	assert.equal(
		byClass(selectButton, 'aulyckanban-accessible-label')[0].textContent,
		'archive.delete.mode',
	);
	assert.equal(sortButton.icon, 'arrow-up-down');

	const browseToolbarRule =
		css.match(/\.aulyckanban-archive-toolbar-browse\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(browseToolbarRule, /justify-content:\s*flex-end;/);
});

test('archive bidirectional sort button toggles newest and oldest order without a select menu', () => {
	const { container } = createHarness();
	const newestFirstButton = byClass(container, 'aulyckanban-archive-sort-btn')[0];

	assert.equal(newestFirstButton.icon, 'arrow-up-down');
	assert.equal(newestFirstButton.attributes['aria-label'], undefined);
	assert.equal(newestFirstButton.attributes.title, undefined);
	assert.equal(
		byClass(newestFirstButton, 'aulyckanban-accessible-label')[0].textContent,
		'archive.sort.newest',
	);
	newestFirstButton.listeners.get('click')[0]();

	const oldestFirstButton = byClass(container, 'aulyckanban-archive-sort-btn')[0];
	assert.equal(oldestFirstButton.icon, 'arrow-up-down');
	assert.equal(
		byClass(oldestFirstButton, 'aulyckanban-accessible-label')[0].textContent,
		'archive.sort.oldest',
	);
});

test('archive selection mode replaces browse controls and hides restore actions', () => {
	const { container } = createHarness();
	const selectButton = byClass(container, 'aulyckanban-archive-select-mode-btn')[0];
	selectButton.listeners.get('click')[0]();

	assert.equal(byClass(container, 'aulyckanban-archive-toolbar-browse').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-toolbar-selection').length, 1);
	assert.equal(byClass(container, 'aulyckanban-archive-search').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-restore-btn').length, 0);
	assert.equal(byClass(container, 'aulyckanban-archive-more-btn').length, 0);
	const deleteButton = byClass(container, 'aulyckanban-archive-delete-selected-btn')[0];
	assert.equal(deleteButton.icon, 'trash-2');
	assert.equal(deleteButton.textContent, '');
	assert.equal(
		byClass(deleteButton, 'aulyckanban-accessible-label')[0].textContent,
		'archive.delete.selected',
	);
	assert.equal(deleteButton.disabled, true);
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
});

test('clicking an archive card selects the whole card and updates the selected count', () => {
	const { container } = createHarness();
	byClass(container, 'aulyckanban-archive-select-mode-btn')[0].listeners.get('click')[0]();
	const card = byClass(container, 'aulyckanban-archive-task')[0];
	card.listeners.get('click')[0]({ target: card });

	assert.equal(byClass(container, 'aulyckanban-archive-task-selected').length, 1);
	assert.equal(
		byClass(container, 'aulyckanban-archive-selected-count')[0].textContent,
		'已选 1 项',
	);
	assert.equal(byClass(container, 'aulyckanban-archive-delete-selected-btn')[0].disabled, false);
});
