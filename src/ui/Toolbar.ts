import { t } from '../i18n';
import type { KanbanStore } from '../store';
import type { ViewKind } from '../types';
import { shouldCommitInlineInput } from '../utils/keyboard';
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
		this.el.empty();
		const currentView = this.store.getCurrentView();
		const isArchive = this.store.isShowingArchive();
		const leftEl = this.el.createDiv({ cls: 'aulyckanban-toolbar-left' });
		const viewStripEl = leftEl.createDiv({ cls: 'aulyckanban-view-strip' });

		for (const view of this.store.getTaskViews()) {
			this.createTab(viewStripEl, view.id, view.title, currentView === view.id && !isArchive);
		}

		if (this.isAdding) this.renderAddInput(viewStripEl);
		else {
			const addBtn = viewStripEl.createEl('button', {
				text: '+',
				cls: 'aulyckanban-tab aulyckanban-view-add-btn',
				attr: { type: 'button', 'aria-label': t('view.add') },
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
				'aria-label': t('archive.tooltip'),
				title: t('archive.tooltip'),
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
	}

	private renderAddInput(parentEl: HTMLElement): void {
		const input = parentEl.createEl('input', {
			cls: 'aulyckanban-view-add-input',
			attr: { type: 'text', placeholder: t('view.addPrompt') },
		});
		input.value = this.draftTitle;
		let composing = false;
		input.addEventListener('input', () => { this.draftTitle = input.value; });
		input.addEventListener('compositionstart', () => { composing = true; });
		input.addEventListener('compositionend', () => {
			composing = false;
			this.draftTitle = input.value;
		});
		input.addEventListener('keydown', (event: KeyboardEvent) => {
			if (shouldCommitInlineInput(event, composing)) {
				event.preventDefault();
				event.stopPropagation();
				const title = input.value.trim();
				if (!title) return;
				this.isAdding = false;
				this.draftTitle = '';
				this.store.dispatch({ type: 'ADD_VIEW', payload: { title } });
			} else if (event.key === 'Escape') {
				event.preventDefault();
				this.cancelAdd();
			}
		});
		input.addEventListener('blur', () => this.cancelAdd());
		requestAnimationFrame(() => input.focus({ preventScroll: true }));
	}

	private cancelAdd(): void {
		if (!this.isAdding) return;
		this.isAdding = false;
		this.draftTitle = '';
		this.render();
	}

	private createTab(parentEl: HTMLElement, view: ViewKind, label: string, isActive: boolean): void {
		const button = parentEl.createEl('button', {
			text: label,
			cls: isActive
				? 'aulyckanban-tab aulyckanban-view-tab aulyckanban-tab-active'
				: 'aulyckanban-tab aulyckanban-view-tab',
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
	}

	getEl(): HTMLElement { return this.el; }
}
