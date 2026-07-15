import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_KANBAN } from '../constants';
import { t } from '../i18n';
import type KanbanPlugin from '../main';
import { Board } from './Board';
import { clearResizeHost, updateResizeHost } from '../utils/resizeHost';
import {
	getNextFocusZone,
	getColumnNavigationTarget,
	getTaskZoneFocusTarget,
	getTaskZoneNavigationItems,
	getTaskTypeNavigationTarget,
	getWrappedItemIndex,
	revealTaskTypeItem,
	shouldUseTabFocusFallback,
	type KanbanFocusZone,
	type ColumnNavigationTarget,
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

		// Tab 在任务类型、任务内容、象限间循环；全部任务/归档分别固定在顶部两端。
		this.tabHandler = (e: KeyboardEvent) => {
			const active = this.getActiveElement();
			if (e.key === 'Tab') {
				this.handleTabKey(e, active);
				return;
			}

			const isEmptyTaskInputArrow =
				active instanceof HTMLTextAreaElement &&
				active.matches('.aulyckanban-task-create-input') &&
				active.value.trim().length === 0 &&
				(e.key === 'ArrowUp' || e.key === 'ArrowDown');
			const isTaskControlNavigationArrow =
				active?.matches(
					'.aulyckanban-task-search-input, .aulyckanban-task-search-tag, ' +
						'.aulyckanban-task-add-btn, .aulyckanban-task-create-target',
				) &&
				(e.key === 'ArrowUp' || e.key === 'ArrowDown');
			if (
				!isEmptyTaskInputArrow &&
				!isTaskControlNavigationArrow &&
				active?.matches(
					'.aulyckanban-view-inline-input, .aulyckanban-nav-inline-input, ' +
						'.aulyckanban-task-search-input, .aulyckanban-task-create-target, ' +
						'.aulyckanban-task-create-input, .aulyckanban-edit-textarea',
				)
			)
				return;
			const zone = this.getFocusZone(active);
			if (zone === 'view' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
				e.preventDefault();
				e.stopPropagation();
				this.selectAdjacentView(e.key === 'ArrowLeft' ? -1 : 1);
			} else if (zone === 'columns' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
				e.preventDefault();
				e.stopPropagation();
				this.selectAdjacentColumn(e.key === 'ArrowUp' ? -1 : 1);
			} else if (zone === 'tasks') {
				if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
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
				const documentLevelTarget =
					eventTarget === null ||
					eventTarget === fallbackWindow ||
					eventTarget === ownerDocument ||
					eventTarget === ownerDocument.body ||
					eventTarget === ownerDocument.documentElement;

				if (
					!shouldUseTabFocusFallback({
						key: e.key,
						defaultPrevented: e.defaultPrevented,
						viewIsActive: this.app.workspace.getActiveViewOfType(KanbanView) === this,
						eventPathIncludesView: e.composedPath().includes(container),
						activeElementIsInsideView: active !== null && container.contains(active),
						documentLevelTarget,
					})
				)
					return;

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
			? (active as HTMLElement)
			: null;
	}

	private handleTabKey(e: KeyboardEvent, active: HTMLElement | null): void {
		e.preventDefault();
		e.stopPropagation();
		this.focusNextZone(
			e.shiftKey,
			active?.matches(
				'.aulyckanban-view-inline-input, .aulyckanban-nav-inline-input, ' +
					'.aulyckanban-task-search-input, .aulyckanban-task-create-target, ' +
					'.aulyckanban-task-create-input, .aulyckanban-edit-textarea',
			) ?? false,
			active,
		);
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
		if (element.closest('.aulyckanban-task-pane')) return 'tasks';
		if (element.closest('.aulyckanban-category-nav')) return 'columns';
		return null;
	}

	private getFocusTarget(zone: KanbanFocusZone): HTMLElement | null {
		switch (zone) {
			case 'view':
				if (this.plugin.store.isShowingArchive()) {
					return this.contentEl.querySelector<HTMLElement>('.aulyckanban-archive-btn');
				}
				if (this.plugin.store.isShowingAllTasks()) {
					return this.contentEl.querySelector<HTMLElement>('.aulyckanban-all-tasks-btn');
				}
				return (
					this.contentEl.querySelector<HTMLElement>(
						'.aulyckanban-view-tab.aulyckanban-tab-active',
					) ?? this.contentEl.querySelector<HTMLElement>('.aulyckanban-view-tab')
				);
			case 'tasks':
				return getTaskZoneFocusTarget(this.contentEl);
			case 'columns':
				if (this.plugin.store.isShowingAllColumns()) {
					return this.contentEl.querySelector<HTMLElement>('.aulyckanban-nav-all-btn');
				}
				return (
					this.contentEl.querySelector<HTMLElement>('.aulyckanban-nav-item-active') ??
					this.contentEl.querySelector<HTMLElement>('.aulyckanban-nav-item')
				);
		}
	}

	private selectAdjacentView(offset: number): void {
		const store = this.plugin.store;
		const views = store.getTaskViews();
		const focusedTarget = this.getFocusedTaskTypeTarget();
		const target = getTaskTypeNavigationTarget(
			views.map((view) => view.id),
			store.getCurrentView(),
			store.getTaskScope(),
			offset,
			focusedTarget,
		);
		if (!target) return;
		if (target.kind === 'all') {
			if (!store.isShowingAllTasks()) store.dispatch({ type: 'SHOW_ALL_TASKS' });
			this.focusZoneAfterRender('view');
		} else if (target.kind === 'add') {
			const addButton = this.contentEl.querySelector<HTMLElement>('.aulyckanban-view-add-btn');
			addButton?.focus({ preventScroll: true });
			if (addButton) revealTaskTypeItem(addButton);
		} else if (target.kind === 'archive') {
			if (!store.isShowingArchive()) store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
			this.focusZoneAfterRender('view');
		} else {
			if (
				store.isShowingArchive() ||
				store.isShowingAllTasks() ||
				store.getCurrentView() !== target.id
			) {
				store.dispatch({ type: 'SWITCH_VIEW', payload: { view: target.id } });
			}
			this.focusZoneAfterRender('view');
		}
	}

	private getFocusedTaskTypeTarget(): TaskTypeNavigationTarget | null {
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		if (!active || !this.contentEl.contains(active)) return null;
		if (active.closest('.aulyckanban-all-tasks-btn')) return { kind: 'all' };
		if (active.closest('.aulyckanban-view-add-btn')) return { kind: 'add' };
		if (active.closest('.aulyckanban-archive-btn')) return { kind: 'archive' };
		const viewTab = active.closest<HTMLElement>('.aulyckanban-view-tab');
		const viewId = viewTab?.dataset['viewId'];
		return viewId ? { kind: 'view', id: viewId } : null;
	}

	private selectAdjacentColumn(offset: number): void {
		const store = this.plugin.store;
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		let focusedTarget: ColumnNavigationTarget | null = null;
		if (active?.closest('.aulyckanban-nav-all-btn')) focusedTarget = { kind: 'all' };
		else if (active?.closest('.aulyckanban-nav-add-btn')) focusedTarget = { kind: 'add' };
		else {
			const columnId = active?.closest<HTMLElement>('.aulyckanban-nav-item')?.dataset['columnId'];
			if (columnId) focusedTarget = { kind: 'column', id: columnId };
		}
		const target = getColumnNavigationTarget(
			store.getCurrentColumns().map((column) => column.id),
			store.getActiveColumnId(),
			store.getColumnScope(),
			offset,
			focusedTarget,
		);
		if (!target) return;
		if (target.kind === 'all') {
			if (!store.isShowingAllColumns()) store.dispatch({ type: 'SHOW_ALL_COLUMNS' });
			this.focusZoneAfterRender('columns');
			return;
		}
		if (target.kind === 'add') {
			const addButton = this.contentEl.querySelector<HTMLElement>('.aulyckanban-nav-add-btn');
			addButton?.focus({ preventScroll: true });
			return;
		}
		if (target.id !== store.getActiveColumnId() || store.isShowingAllColumns()) {
			store.dispatch({ type: 'SELECT_COLUMN', payload: { columnId: target.id } });
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
