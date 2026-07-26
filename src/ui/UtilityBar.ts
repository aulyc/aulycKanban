import { setIcon } from 'obsidian';
import { t } from '../i18n';
import type { KanbanStore } from '../store';
import { appendAccessibleLabel } from '../utils/dom';
import { createInlineInput } from './InlineInput';

/** 顶部工具区：共享搜索与归档入口。 */
export class UtilityBar {
	private readonly el: HTMLElement;
	private readonly store: KanbanStore;
	private isEditingSearch = false;
	private searchDraft = '';
	private shouldFocusSearchInput = false;

	constructor(parentEl: HTMLElement, store: KanbanStore) {
		this.store = store;
		this.el = parentEl.createDiv({ cls: 'aulyckanban-utility-bar' });
		this.render();
	}

	render(): void {
		const focusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const isArchive = this.store.isShowingArchive();
		const restoreSearchFocus =
			!!focusedEl &&
			this.el.contains(focusedEl) &&
			(focusedEl.classList.contains('aulyckanban-task-search-input') ||
				focusedEl.classList.contains('aulyckanban-task-search-tag'));
		const restoreArchiveFocus =
			!!focusedEl &&
			this.el.contains(focusedEl) &&
			focusedEl.classList.contains('aulyckanban-archive-btn') &&
			isArchive;

		this.el.empty();
		const searchShellEl = this.el.createDiv({ cls: 'aulyckanban-task-search-shell' });
		const keyword = this.store.getSearchKeyword();
		if (!keyword) this.resetSearchEditing();
		const focusSearchAfterRender = this.consumeSearchFocusRequest();
		const searchTarget = keyword
			? this.isEditingSearch
				? this.renderSearchEditInput(searchShellEl, keyword)
				: this.renderSearchTag(searchShellEl, keyword)
			: this.renderSearchInput(searchShellEl);
		searchTarget.addEventListener('focus', () => {
			if (this.store.isShowingArchive()) {
				this.store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
			}
		});

		const archiveBtn = this.el.createEl('button', {
			cls: isArchive
				? 'aulyckanban-tab aulyckanban-archive-btn aulyckanban-tab-active'
				: 'aulyckanban-tab aulyckanban-archive-btn',
			attr: {
				type: 'button',
				tabindex: '-1',
				'aria-selected': String(isArchive),
			},
		});
		setIcon(archiveBtn, 'archive');
		appendAccessibleLabel(archiveBtn, t('archive.open'));
		const activateArchive = (): void => {
			if (!this.store.isShowingArchive()) {
				this.store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
			}
		};
		archiveBtn.addEventListener('focus', activateArchive);
		archiveBtn.addEventListener('click', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			activateArchive();
		});

		if (focusSearchAfterRender || restoreSearchFocus) searchTarget.focus({ preventScroll: true });
		else if (restoreArchiveFocus) archiveBtn.focus({ preventScroll: true });
	}

	private renderSearchInput(parentEl: HTMLElement): HTMLInputElement | HTMLTextAreaElement {
		return createInlineInput(parentEl, {
			cls: 'aulyckanban-task-search-input',
			placeholder: t('task.search.placeholder'),
			persistent: true,
			onCommit: (value) => {
				const keyword = value.trim();
				if (!keyword) return false;
				this.store.dispatch({ type: 'SET_SEARCH_QUERY', payload: { keyword } });
				return true;
			},
		});
	}

	private renderSearchTag(parentEl: HTMLElement, keyword: string): HTMLElement {
		const tagEl = parentEl.createDiv({
			cls: 'aulyckanban-task-search-tag',
			attr: { tabindex: '-1', role: 'group' },
		});
		tagEl.createSpan({ cls: 'aulyckanban-task-search-tag-text', text: keyword });
		const clearBtn = tagEl.createEl('button', {
			cls: 'aulyckanban-task-search-clear',
			attr: { type: 'button', tabindex: '-1' },
		});
		setIcon(clearBtn, 'x');
		appendAccessibleLabel(clearBtn, t('task.search.clear'));
		const clear = (event: MouseEvent | KeyboardEvent): void => {
			event.preventDefault();
			event.stopPropagation();
			this.store.dispatch({ type: 'SET_SEARCH_QUERY', payload: { keyword: '' } });
		};
		clearBtn.addEventListener('click', clear);
		tagEl.addEventListener('dblclick', (event: MouseEvent) => {
			if (event.target && clearBtn.contains(event.target as Node)) return;
			event.preventDefault();
			event.stopPropagation();
			this.isEditingSearch = true;
			this.searchDraft = keyword;
			this.shouldFocusSearchInput = true;
			this.render();
		});
		tagEl.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'Delete') {
				clear(event);
			}
		});
		return tagEl;
	}

	private renderSearchEditInput(
		parentEl: HTMLElement,
		currentKeyword: string,
	): HTMLInputElement | HTMLTextAreaElement {
		return createInlineInput(parentEl, {
			cls: 'aulyckanban-task-search-input',
			initialValue: this.searchDraft,
			blurBehavior: 'commit',
			stopClickPropagation: true,
			onInput: (value) => {
				this.searchDraft = value;
			},
			onCommit: (value) => {
				const keyword = value.trim();
				this.resetSearchEditing();
				if (keyword === currentKeyword) this.render();
				else this.store.dispatch({ type: 'SET_SEARCH_QUERY', payload: { keyword } });
				return true;
			},
			onCancel: () => {
				this.resetSearchEditing();
				this.render();
			},
		});
	}

	private consumeSearchFocusRequest(): boolean {
		const shouldFocus = this.shouldFocusSearchInput;
		this.shouldFocusSearchInput = false;
		return shouldFocus;
	}

	private resetSearchEditing(): void {
		this.isEditingSearch = false;
		this.searchDraft = '';
		this.shouldFocusSearchInput = false;
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
