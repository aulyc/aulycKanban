import { t } from '../i18n';
import type { KanbanStore } from '../store';
import type { ViewKind } from '../types';
import { createInlineInput } from './InlineInput';
import { ConfirmModal } from './ConfirmModal';
import { revealTaskTypeItem } from '../utils/focusCycle';
import { Menu, setIcon } from 'obsidian';
import type { App } from 'obsidian';

/** 顶部工具栏：动态任务类型 + 新增任务类型 + 统一归档 */
export class Toolbar {
	private readonly el: HTMLElement;
	private readonly app: App;
	private readonly store: KanbanStore;
	private editingViewId: ViewKind | null = null;
	private isAdding = false;
	private draftTitle = '';
	private shouldFocusInput = false;

	constructor(parentEl: HTMLElement, app: App, store: KanbanStore) {
		this.app = app;
		this.store = store;
		this.el = parentEl.createDiv({ cls: 'aulyckanban-toolbar' });
		this.render();
	}

	render(): void {
		this.el.toggleClass(
			'aulyckanban-toolbar-editing',
			this.isAdding || this.editingViewId !== null,
		);
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
			if (this.editingViewId === view.id) {
				this.renderRenameInput(viewStripEl, view.id, view.title);
				continue;
			}
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
				this.editingViewId = null;
				this.isAdding = true;
				this.draftTitle = '';
				this.shouldFocusInput = false;
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
			cls: 'aulyckanban-view-inline-input aulyckanban-view-add-input',
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

	private renderRenameInput(parentEl: HTMLElement, viewId: ViewKind, currentTitle: string): void {
		const inputEl = createInlineInput(parentEl, {
			cls: 'aulyckanban-view-inline-input aulyckanban-view-rename-input',
			initialValue: this.draftTitle || currentTitle,
			focusOnMount: this.consumeFocusRequest(),
			blurBehavior: 'commit',
			onInput: (value) => { this.draftTitle = value; },
			onCommit: (value) => {
				const title = value.trim();
				if (!title) return false;
				this.editingViewId = null;
				this.draftTitle = '';
				this.shouldFocusInput = false;
				if (title === currentTitle) this.render();
				else this.store.dispatch({ type: 'RENAME_VIEW', payload: { viewId, title } });
				return true;
			},
			onCancel: () => this.cancelRename(),
		});
		requestAnimationFrame(() => revealTaskTypeItem(inputEl));
	}

	private cancelAdd(): void {
		if (!this.isAdding) return;
		this.isAdding = false;
		this.draftTitle = '';
		this.shouldFocusInput = false;
		this.render();
	}

	private cancelRename(): void {
		if (this.editingViewId === null) return;
		this.editingViewId = null;
		this.draftTitle = '';
		this.shouldFocusInput = false;
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
		button.addEventListener('contextmenu', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			this.showViewMenu(event, view, label);
		});
		button.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
			event.preventDefault();
			event.stopPropagation();
			const rect = button.getBoundingClientRect();
			this.showViewMenu(new MouseEvent('contextmenu', {
				clientX: rect.left + rect.width / 2,
				clientY: rect.bottom,
			}), view, label);
		});
		return button;
	}

	private showViewMenu(event: MouseEvent, viewId: ViewKind, currentTitle: string): void {
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle(t('view.rename'))
				.setIcon('pencil')
				.onClick(() => this.startRename(viewId, currentTitle));
		});
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t('view.delete'))
				.setIcon('trash')
				.setDisabled(this.store.getTaskViews().length <= 1)
				.onClick(() => this.confirmDelete(viewId));
		});
		menu.showAtMouseEvent(event);
	}

	private startRename(viewId: ViewKind, currentTitle: string): void {
		this.editingViewId = viewId;
		this.isAdding = false;
		this.draftTitle = currentTitle;
		this.shouldFocusInput = true;
		this.render();
	}

	private confirmDelete(viewId: ViewKind): void {
		if (this.store.getTaskViews().length <= 1) return;
		const view = this.store.getView(viewId);
		if (!view) return;
		const taskCount = view.columns.reduce((count, column) => count + column.tasks.length, 0);
		const archiveCount = this.store.getArchive(viewId).length;
		const message = `${t('view.deleteConfirm').replace('{title}', view.title)}\n${t('view.deleteData')
			.replace('{taskCount}', String(taskCount))
			.replace('{archiveCount}', String(archiveCount))}`;
		new ConfirmModal(this.app, {
			message,
			isDestructive: true,
			onConfirm: () => this.store.dispatch({ type: 'DELETE_VIEW', payload: { viewId } }),
		}).open();
	}

	private consumeFocusRequest(): boolean {
		const shouldFocus = this.shouldFocusInput;
		this.shouldFocusInput = false;
		return shouldFocus;
	}

	getEl(): HTMLElement { return this.el; }
}
