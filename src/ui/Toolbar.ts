import { t } from '../i18n';
import type { KanbanStore } from '../store';
import type { ViewKind } from '../types';
import { createInlineInput } from './InlineInput';
import { revealTaskTypeItem } from '../utils/focusCycle';
import { setIcon } from 'obsidian';

/** 顶部工具栏：动态任务类型 + 新增任务类型 + 统一归档 */
export class Toolbar {
	private readonly el: HTMLElement;
	private readonly store: KanbanStore;
	private isAdding = false;
	private draftTitle = '';

	constructor(parentEl: HTMLElement, store: KanbanStore) {
		this.store = store;
		this.el = parentEl.createDiv({ cls: 'aulyckanban-toolbar' });
		this.render();
	}

	render(): void {
		const focusedEl = document.activeElement instanceof HTMLElement
			? document.activeElement
			: null;
		const restoreSelectedFocus = !!focusedEl
			&& this.el.contains(focusedEl)
			&& (
				focusedEl.classList.contains('aulyckanban-view-tab')
				|| focusedEl.classList.contains('aulyckanban-archive-btn')
			);

		this.el.empty();
		const currentView = this.store.getCurrentView();
		const isArchive = this.store.isShowingArchive();
		const leftEl = this.el.createDiv({ cls: 'aulyckanban-toolbar-left' });
		const viewStripEl = leftEl.createDiv({ cls: 'aulyckanban-view-strip' });
		let selectedViewButton: HTMLButtonElement | null = null;

		for (const view of this.store.getTaskViews()) {
			const isActive = currentView === view.id && !isArchive;
			const button = this.createTab(viewStripEl, view.id, view.title, isActive);
			if (isActive) selectedViewButton = button;
		}

		if (this.isAdding) this.renderAddInput(viewStripEl);
		else {
			const addBtn = viewStripEl.createEl('button', {
				text: '+',
				cls: 'aulyckanban-tab aulyckanban-view-add-btn',
				attr: { type: 'button', tabindex: '-1', 'aria-label': t('view.add') },
			});
			addBtn.addEventListener('click', (event: MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();
				this.isAdding = true;
				this.draftTitle = '';
				this.render();
			});
		}

		const archiveSlotEl = leftEl.createDiv({ cls: 'aulyckanban-archive-slot' });
		const archiveBtn = archiveSlotEl.createEl('button', {
			cls: isArchive
				? 'aulyckanban-tab aulyckanban-archive-btn aulyckanban-tab-active'
				: 'aulyckanban-tab aulyckanban-archive-btn',
			attr: {
				type: 'button',
				tabindex: '-1',
				'aria-label': t('archive.tooltip'),
				'aria-selected': String(isArchive),
			},
		});
		setIcon(archiveBtn, 'archive');
		archiveBtn.addEventListener('click', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			if (!this.store.isShowingArchive()) {
				this.store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
			}
		});

		if (restoreSelectedFocus) {
			const target = isArchive ? archiveBtn : selectedViewButton;
			target?.focus({ preventScroll: true });
			if (target) revealTaskTypeItem(target);
		}
	}

	private renderAddInput(parentEl: HTMLElement): void {
		const inputEl = createInlineInput(parentEl, {
			cls: 'aulyckanban-view-add-input',
			placeholder: t('view.addPrompt'),
			initialValue: this.draftTitle,
			focusOnMount: true,
			blurBehavior: 'cancel',
			onInput: (value) => { this.draftTitle = value; },
			onCommit: (value) => {
				const title = value.trim();
				if (!title) return false;
				this.isAdding = false;
				this.draftTitle = '';
				this.store.dispatch({ type: 'ADD_VIEW', payload: { title } });
				return true;
			},
			onCancel: () => this.cancelAdd(),
		});
		requestAnimationFrame(() => revealTaskTypeItem(inputEl));
	}

	private cancelAdd(): void {
		if (!this.isAdding) return;
		this.isAdding = false;
		this.draftTitle = '';
		this.render();
	}

	private createTab(
		parentEl: HTMLElement,
		view: ViewKind,
		label: string,
		isActive: boolean,
	): HTMLButtonElement {
		const button = parentEl.createEl('button', {
			text: label,
			cls: isActive
				? 'aulyckanban-tab aulyckanban-view-tab aulyckanban-tab-active'
				: 'aulyckanban-tab aulyckanban-view-tab',
			attr: { type: 'button', tabindex: '-1' },
		});
		button.dataset['viewId'] = view;
		button.setAttribute('aria-selected', String(isActive));
		button.addEventListener('click', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			if (this.store.getCurrentView() !== view || this.store.isShowingArchive()) {
				this.store.dispatch({ type: 'SWITCH_VIEW', payload: { view } });
			}
		});
		return button;
	}

	getEl(): HTMLElement { return this.el; }
}
