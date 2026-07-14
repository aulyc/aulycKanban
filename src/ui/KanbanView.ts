import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_KANBAN } from '../constants';
import { t } from '../i18n';
import type KanbanPlugin from '../main';
import { Board } from './Board';
import { clearResizeHost, updateResizeHost } from '../utils/resizeHost';
import {
	getNextFocusZone,
	getTaskZoneFocusTarget,
	getTaskZoneNavigationItems,
	getTaskTypeNavigationTarget,
	getWrappedItemIndex,
	revealTaskTypeItem,
	shouldUseTabFocusFallback,
	type KanbanFocusZone,
	type TaskTypeNavigationTarget,
} from '../utils/focusCycle';

/**
 * 看板主视图
 * 作为 Obsidian 标签页 / 侧栏面板展示
 */
export class KanbanView extends ItemView {
	private readonly plugin: KanbanPlugin;
	private board: Board | null = null;
	private unsubscribe: (() => void) | null = null;
	private isClosing = false;
	private tabHandler: ((e: KeyboardEvent) => void) | null = null;
	private tabFallbackHandler: ((e: KeyboardEvent) => void) | null = null;
	private tabFallbackWindow: Window | null = null;
	private renderQueued = false;
	private resizeHostEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: KanbanPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_KANBAN;
	}

	getDisplayText(): string {
		return t('view.displayName');
	}

	getIcon(): string {
		return 'list-todo';
	}

	async onOpen(): Promise<void> {
		this.isClosing = false;

		const container = this.contentEl;
		container.empty();
		container.addClass('aulyckanban-kanban-container');
		// 让容器可聚焦，接收键盘事件
		container.setAttribute('tabindex', '0');
		this.resizeHostEl = updateResizeHost(this.resizeHostEl, this.containerEl);

		this.board = new Board(container, this.app, this.plugin.store);
		this.board.render();

		// 订阅 store 变化，自动重渲染
		this.unsubscribe = this.plugin.store.subscribe(() => {
			if (this.isClosing || !this.board) return;
			this.requestRender();
		});

		// Tab 在任务类型、任务内容、象限间循环；归档作为固定在最右侧的特殊任务类型。
		this.tabHandler = (e: KeyboardEvent) => {
			const active = this.getActiveElement();
			if (e.key === 'Tab') {
				this.handleTabKey(e, active);
				return;
			}

			const isEmptyTaskInputArrow = active instanceof HTMLTextAreaElement
				&& active.matches('.aulyckanban-inline-input')
				&& active.value.trim().length === 0
				&& (e.key === 'ArrowUp' || e.key === 'ArrowDown');
			if (!isEmptyTaskInputArrow && active?.matches(
				'.aulyckanban-view-inline-input, .aulyckanban-nav-inline-input, '
				+ '.aulyckanban-inline-input, .aulyckanban-edit-textarea',
			)) return;
			const zone = this.getFocusZone(active);
			if (zone === 'view' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
				e.preventDefault();
				e.stopPropagation();
				this.selectAdjacentView(e.key === 'ArrowLeft' ? -1 : 1);
			} else if (zone === 'columns' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
				e.preventDefault();
				e.stopPropagation();
				this.selectAdjacentColumn(e.key === 'ArrowUp' ? -1 : 1);
			} else if (zone === 'tasks' && !this.plugin.store.isShowingArchive()) {
				if (
					active?.matches('.aulyckanban-task, .aulyckanban-inline-input')
					&& (e.key === 'ArrowUp' || e.key === 'ArrowDown')
				) {
					e.preventDefault();
					e.stopPropagation();
					this.selectAdjacentTaskItem(e.key === 'ArrowUp' ? -1 : 1);
				}
			}
		};
		container.addEventListener('keydown', this.tabHandler, true);

		// Electron 偶发把按键投递到 window/document/body，导致容器监听器收不到事件。
		// 仅对当前活动看板的孤立 Tab 兜底，避免抢占弹窗、编辑器或侧栏控件。
		const fallbackWindow = container.ownerDocument.defaultView;
		if (fallbackWindow) {
			this.tabFallbackWindow = fallbackWindow;
			this.tabFallbackHandler = (e: KeyboardEvent) => {
				const ownerDocument = container.ownerDocument;
				const active = this.getActiveElement();
				const eventTarget = e.target;
				const documentLevelTarget = eventTarget === null
					|| eventTarget === fallbackWindow
					|| eventTarget === ownerDocument
					|| eventTarget === ownerDocument.body
					|| eventTarget === ownerDocument.documentElement;

				if (!shouldUseTabFocusFallback({
					key: e.key,
					defaultPrevented: e.defaultPrevented,
					viewIsActive: this.app.workspace.getActiveViewOfType(KanbanView) === this,
					eventPathIncludesView: e.composedPath().includes(container),
					activeElementIsInsideView: active !== null && container.contains(active),
					documentLevelTarget,
				})) return;

				this.handleTabKey(e, active);
			};
			fallbackWindow.addEventListener('keydown', this.tabFallbackHandler, true);
		}
	}

	async onClose(): Promise<void> {
		this.isClosing = true;
		clearResizeHost(this.resizeHostEl);
		this.resizeHostEl = null;

		if (this.tabHandler) {
			this.contentEl.removeEventListener('keydown', this.tabHandler, true);
			this.tabHandler = null;
		}
		if (this.tabFallbackWindow && this.tabFallbackHandler) {
			this.tabFallbackWindow.removeEventListener('keydown', this.tabFallbackHandler, true);
		}
		this.tabFallbackHandler = null;
		this.tabFallbackWindow = null;

		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}

		if (this.board) {
			this.board.destroy();
			this.board = null;
		}
	}

	/** Obsidian 拖拽或移动分栏时重新识别宽度宿主。 */
	onResize(): void {
		this.resizeHostEl = updateResizeHost(this.resizeHostEl, this.containerEl);
	}

	/** 从 Ribbon 或命令打开看板后，让首次 Tab 直接进入焦点循环。 */
	focusBoard(): void {
		requestAnimationFrame(() => {
			if (this.isClosing) return;
			this.contentEl.focus({ preventScroll: true });
		});
	}

	private getActiveElement(): HTMLElement | null {
		const ownerDocument = this.contentEl.ownerDocument;
		const ownerWindow = ownerDocument.defaultView;
		const active = ownerDocument.activeElement;
		return ownerWindow && active instanceof ownerWindow.HTMLElement
			? active as HTMLElement
			: null;
	}

	private handleTabKey(e: KeyboardEvent, active: HTMLElement | null): void {
		e.preventDefault();
		e.stopPropagation();
		this.focusNextZone(e.shiftKey, active?.matches(
			'.aulyckanban-view-inline-input, .aulyckanban-nav-inline-input, '
			+ '.aulyckanban-inline-input, .aulyckanban-edit-textarea',
		) ?? false, active);
	}

	private focusNextZone(
		reverse: boolean,
		afterBlur = false,
		active: HTMLElement | null = this.getActiveElement(),
	): void {
		const currentZone = this.getFocusZone(active);
		const nextZone = getNextFocusZone(currentZone, reverse);
		const focusTarget = (): void => {
			const target = this.getFocusTarget(nextZone);
			target?.focus({ preventScroll: true });
			if (nextZone === 'tasks') target?.scrollIntoView({ block: 'nearest' });
			if (nextZone === 'view' && target) revealTaskTypeItem(target);
		};
		if (afterBlur) {
			active?.blur();
			requestAnimationFrame(focusTarget);
		} else {
			focusTarget();
		}
	}

	private getFocusZone(element: HTMLElement | null): KanbanFocusZone | null {
		if (!element || !this.contentEl.contains(element)) return null;
		if (element.closest('.aulyckanban-toolbar')) return 'view';
		if (element.closest('.aulyckanban-task-list')) return 'tasks';
		if (element.closest('.aulyckanban-archive-container')) return 'tasks';
		if (element.closest('.aulyckanban-category-nav')) return 'columns';
		return null;
	}

	private getFocusTarget(zone: KanbanFocusZone): HTMLElement | null {
		switch (zone) {
			case 'view':
				if (this.plugin.store.isShowingArchive()) {
					return this.contentEl.querySelector<HTMLElement>('.aulyckanban-archive-btn');
				}
				return this.contentEl.querySelector<HTMLElement>(
					'.aulyckanban-view-tab.aulyckanban-tab-active',
				) ?? this.contentEl.querySelector<HTMLElement>('.aulyckanban-view-tab');
			case 'tasks':
				if (this.plugin.store.isShowingArchive()) {
					return this.contentEl.querySelector<HTMLElement>(
						'.aulyckanban-archive-search, .aulyckanban-archive-container',
					);
				}
				return getTaskZoneFocusTarget(this.contentEl);
			case 'columns':
				return this.contentEl.querySelector<HTMLElement>(
					'.aulyckanban-nav-item-active',
				) ?? this.contentEl.querySelector<HTMLElement>('.aulyckanban-nav-item');
		}
	}

	private selectAdjacentView(offset: number): void {
		const store = this.plugin.store;
		const views = store.getTaskViews();
		const focusedTarget = this.getFocusedTaskTypeTarget();
		const target = getTaskTypeNavigationTarget(
			views.map((view) => view.id),
			store.getCurrentView(),
			store.isShowingArchive(),
			offset,
			focusedTarget,
		);
		if (!target) return;
		if (target.kind === 'add') {
			const addButton = this.contentEl.querySelector<HTMLElement>('.aulyckanban-view-add-btn');
			addButton?.focus({ preventScroll: true });
			if (addButton) revealTaskTypeItem(addButton);
		} else if (target.kind === 'archive') {
			if (!store.isShowingArchive()) store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
			this.focusZoneAfterRender('view');
		} else {
			if (store.isShowingArchive() || store.getCurrentView() !== target.id) {
				store.dispatch({ type: 'SWITCH_VIEW', payload: { view: target.id } });
			}
			this.focusZoneAfterRender('view');
		}
	}

	private getFocusedTaskTypeTarget(): TaskTypeNavigationTarget | null {
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		if (!active || !this.contentEl.contains(active)) return null;
		if (active.closest('.aulyckanban-view-add-btn')) return { kind: 'add' };
		if (active.closest('.aulyckanban-archive-btn')) return { kind: 'archive' };
		const viewTab = active.closest<HTMLElement>('.aulyckanban-view-tab');
		const viewId = viewTab?.dataset['viewId'];
		return viewId ? { kind: 'view', id: viewId } : null;
	}

	private selectAdjacentColumn(offset: number): void {
		const store = this.plugin.store;
		const items = Array.from(this.contentEl.querySelectorAll<HTMLElement>(
			'.aulyckanban-nav-item:not(.aulyckanban-nav-item-editing), '
			+ '.aulyckanban-nav-add-btn:not(.aulyckanban-nav-item-editing)',
		));
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const focusedItem = active?.closest<HTMLElement>('.aulyckanban-nav-item, .aulyckanban-nav-add-btn') ?? null;
		const fallbackItem = items.find((item) => item.dataset['columnId'] === store.getActiveColumnId()) ?? null;
		const currentItem = focusedItem ?? fallbackItem;
		const currentIndex = currentItem ? items.indexOf(currentItem) : -1;
		const target = items[getWrappedItemIndex(currentIndex, items.length, offset)];
		if (!target) return;
		if (target.classList.contains('aulyckanban-nav-add-btn')) {
			target.focus({ preventScroll: true });
			return;
		}
		const columnId = target.dataset['columnId'];
		if (!columnId) return;
		if (columnId !== store.getActiveColumnId()) {
			store.dispatch({ type: 'SELECT_COLUMN', payload: { columnId } });
		}
		this.focusZoneAfterRender('columns');
	}

	private selectAdjacentTaskItem(offset: number): void {
		const items = getTaskZoneNavigationItems(this.contentEl);
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const currentIndex = active ? items.indexOf(active) : -1;
		const target = items[getWrappedItemIndex(currentIndex, items.length, offset)];
		target?.focus({ preventScroll: true });
		target?.scrollIntoView({ block: 'nearest' });
	}

	private focusZoneAfterRender(zone: KanbanFocusZone): void {
		requestAnimationFrame(() => {
			const target = this.getFocusTarget(zone);
			target?.focus({ preventScroll: true });
			if (zone === 'view' && target) revealTaskTypeItem(target);
		});
	}

	private requestRender(): void {
		if (this.renderQueued) return;
		this.renderQueued = true;
		requestAnimationFrame(() => {
			this.renderQueued = false;
			if (this.isClosing || !this.board) return;
			this.board.render();
		});
	}
}
