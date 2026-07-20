import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

class MockElement {
	constructor(ownerDocument, tagName = 'div', options = {}) {
		this.ownerDocument = ownerDocument;
		this.tagName = tagName;
		this.children = [];
		this.parentElement = null;
		this.attributes = { ...(options.attr ?? {}) };
		this.classes = new Set(
			String(options.cls ?? '')
				.split(/\s+/)
				.filter(Boolean),
		);
		this.textContent = options.text ?? '';
		this.listeners = new Map();
		this.value = '';
		this.classList = { contains: (value) => this.classes.has(value) };
	}

	append(child) {
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	createDiv(options = {}) {
		return this.append(new MockElement(this.ownerDocument, 'div', options));
	}

	createSpan(options = {}) {
		return this.append(new MockElement(this.ownerDocument, 'span', options));
	}

	createEl(tagName, options = {}) {
		return this.append(new MockElement(this.ownerDocument, tagName, options));
	}

	empty() {
		this.children = [];
	}

	addEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push(listener);
		this.listeners.set(name, listeners);
	}

	contains(candidate) {
		return candidate === this || descendants(this).includes(candidate);
	}

	focus() {
		this.ownerDocument.activeElement = this;
	}
}

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}

const { UtilityBar } = await loadSourceModule(new URL('../src/ui/UtilityBar.ts', import.meta.url), {
	label: 'utility-bar',
	mocks: {
		obsidian: { setIcon: () => {} },
		'../i18n': { t: (key) => key },
		'../utils/dom': {
			appendAccessibleLabel: (element, text) =>
				element.createSpan({ cls: 'aulyckanban-accessible-label', text }),
		},
		'./InlineInput': {
			createInlineInput: (parent, options) => {
				const input = parent.createEl('input', { cls: options.cls });
				input.inputOptions = options;
				return input;
			},
		},
	},
});

function createHarness(overrides = {}) {
	const documentRef = { activeElement: null };
	globalThis.document = documentRef;
	globalThis.HTMLElement = MockElement;
	const store = {
		actions: [],
		keyword: '',
		archive: false,
		getSearchKeyword() {
			return this.keyword;
		},
		isShowingArchive() {
			return this.archive;
		},
		dispatch(action) {
			this.actions.push(action);
			if (action.type === 'SET_SEARCH_QUERY') this.keyword = action.payload.keyword;
			if (action.type === 'TOGGLE_ARCHIVE_VIEW') this.archive = !this.archive;
		},
		...overrides,
	};
	const parent = new MockElement(documentRef);
	const utilityBar = new UtilityBar(parent, store);
	return { documentRef, parent, store, utilityBar };
}

function find(parent, className) {
	return descendants(parent).find((element) => element.classList.contains(className));
}

test('utility row renders search and archive and commits a trimmed query', () => {
	const { parent, store, utilityBar } = createHarness();
	const row = find(parent, 'aulyckanban-utility-bar');
	const search = find(parent, 'aulyckanban-task-search-input');
	const archive = find(parent, 'aulyckanban-archive-btn');
	assert.ok(row);
	assert.ok(search);
	assert.ok(archive);
	assert.equal(archive.attributes.tabindex, '-1');
	assert.equal(find(parent, 'aulyckanban-accessible-label').textContent, 'archive.open');
	assert.equal(utilityBar.getEl(), row);

	assert.equal(search.inputOptions.onCommit('   '), false);
	assert.equal(store.actions.length, 0);
	assert.equal(search.inputOptions.onCommit('  邮箱任务  '), true);
	assert.deepEqual(store.actions.at(-1), {
		type: 'SET_SEARCH_QUERY',
		payload: { keyword: '邮箱任务' },
	});
});

test('committed search becomes a removable tag', () => {
	const { parent, store } = createHarness({ keyword: '邮箱任务' });
	const tag = find(parent, 'aulyckanban-task-search-tag');
	const clear = find(parent, 'aulyckanban-task-search-clear');
	assert.ok(tag);
	assert.ok(clear);
	assert.equal(tag.children[0].textContent, '邮箱任务');

	clear.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });
	assert.deepEqual(store.actions.at(-1), {
		type: 'SET_SEARCH_QUERY',
		payload: { keyword: '' },
	});

	store.keyword = '再次搜索';
	tag.listeners.get('keydown')[0]({
		key: 'Escape',
		preventDefault() {},
		stopPropagation() {},
	});
	assert.equal(store.actions.at(-1).payload.keyword, '');
});

test('archive focus activates immediately and remains idempotent for click or rerender', () => {
	const { parent, store, utilityBar } = createHarness();
	const archive = find(parent, 'aulyckanban-archive-btn');
	archive.listeners.get('focus')[0]();
	assert.equal(store.actions.at(-1).type, 'TOGGLE_ARCHIVE_VIEW');

	const focusedActionCount = store.actions.length;
	archive.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });
	assert.equal(store.actions.length, focusedActionCount);

	utilityBar.render();
	const activeArchive = find(parent, 'aulyckanban-archive-btn');
	assert.equal(activeArchive.classList.contains('aulyckanban-tab-active'), true);
	const actionCount = store.actions.length;
	activeArchive.listeners.get('focus')[0]();
	activeArchive.listeners.get('click')[0]({ preventDefault() {}, stopPropagation() {} });
	assert.equal(store.actions.length, actionCount);
});

test('search focus leaves the temporary archive view', () => {
	const { parent, store } = createHarness({ archive: true });
	const search = find(parent, 'aulyckanban-task-search-input');
	search.focus();
	search.listeners.get('focus')[0]();

	assert.equal(store.archive, false);
	assert.equal(store.actions.at(-1).type, 'TOGGLE_ARCHIVE_VIEW');
});

test('utility rerender restores real search or archive focus', () => {
	const { documentRef, parent, store, utilityBar } = createHarness();
	find(parent, 'aulyckanban-task-search-input').focus();
	utilityBar.render();
	assert.equal(documentRef.activeElement.classList.contains('aulyckanban-task-search-input'), true);

	const archive = find(parent, 'aulyckanban-archive-btn');
	archive.focus();
	store.archive = true;
	utilityBar.render();
	assert.equal(documentRef.activeElement.classList.contains('aulyckanban-archive-btn'), true);
});
