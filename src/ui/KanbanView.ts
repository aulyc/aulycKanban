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
	getTaskZoneHorizontalNavigationItems,
	getTaskZoneNavigationItems,
	getTaskTypeNavigationTarget,
	getUtilityZoneFocusTarget,
	getUtilityZoneNavigationItems,
	getWrappedItemIndex,
	revealTaskTypeItem,
	shouldUseTabFocusFallback,
	type KanbanFocusZone,
	type ColumnNavigationTarget,
	type TaskTypeNavigationTarget,
} from '../utils/focusCycle';

type UtilityFocusTarget = 'search' | 'archive';

type TaskFocusTarget =
	| { kind: 'add' }
	| { kind: 'task'; viewId: string; columnId: string; taskId: string };

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
	private lastUtilityFocusTarget: UtilityFocusTarget | null = null;
	private lastTaskFocusTarget: TaskFocusTarget | null = null;

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

		// Tab 在工具、任务类型、任务内容、象限四区间循环。
		this.tabHandler = (e: KeyboardEvent) => {
			if (this.handleSearchShortcut(e)) return;

			const active = this.getActiveElement();
			if (e.key === 'Tab') {
				this.handleTabKey(e, active);
				return;
			}

			const isEmptyTaskInputArrow =
				!e.isComposing &&
				active instanceof HTMLTextAreaElement &&
				active.matches('.aulyckanban-task-create-input') &&
				active.value.trim().length === 0 &&
				(e.key === 'ArrowUp' || e.key === 'ArrowDown');
			const isTaskControlNavigationArrow =
				!e.isComposing &&
				active?.matches('.aulyckanban-task-add-btn, .aulyckanban-task-create-target') &&
				(e.key === 'ArrowUp' || e.key === 'ArrowDown');
			const isUtilityControlNavigationArrow =
				!e.isComposing &&
				(((e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
					(active?.matches('.aulyckanban-task-search-tag') ||
						(active?.matches('.aulyckanban-task-search-input') &&
							(active as HTMLInputElement).value.length === 0))) ||
					(e.key === 'ArrowDown' &&
						active?.matches(
							'.aulyckanban-task-search-input, .aulyckanban-task-search-tag, ' +
								'.aulyckanban-archive-btn',
						)));
			if (
				!isEmptyTaskInputArrow &&
				!isTaskControlNavigationArrow &&
				!isUtilityControlNavigationArrow &&
				active?.matches(
					'.aulyckanban-view-inline-input, .aulyckanban-nav-inline-input, ' +
						'.aulyckanban-task-search-input, .aulyckanban-task-create-target, ' +
						'.aulyckanban-task-create-input, .aulyckanban-edit-textarea',
				)
			)
				return;
			const zone = this.getFocusZone(active);
			if (zone === 'utility' && e.key === 'ArrowDown') {
				e.preventDefault();
				e.stopPropagation();
				this.rememberUtilityFocusTarget(active);
				this.focusCurrentTaskType();
			} else if (zone === 'utility' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
				e.preventDefault();
				e.stopPropagation();
				this.selectAdjacentUtilityItem(e.key === 'ArrowLeft' ? -1 : 1);
			} else if (zone === 'view' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
				e.preventDefault();
				e.stopPropagation();
				this.selectAdjacentView(e.key === 'ArrowLeft' ? -1 : 1);
			} else if (zone === 'view' && e.key === 'ArrowUp') {
				e.preventDefault();
				e.stopPropagation();
				this.focusRememberedUtilityTarget();
			} else if (zone === 'view' && e.key === 'ArrowDown') {
				e.preventDefault();
				e.stopPropagation();
				this.focusTaskZone();
			} else if (zone === 'columns') {
				if (e.key === 'ArrowLeft' && this.focusRememberedTaskTarget()) {
					e.preventDefault();
					e.stopPropagation();
				} else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					e.preventDefault();
					e.stopPropagation();
					this.selectAdjacentColumn(e.key === 'ArrowUp' ? -1 : 1);
				}
			} else if (zone === 'tasks') {
				if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
					e.preventDefault();
					e.stopPropagation();
					this.selectAdjacentTaskItem(e.key === 'ArrowUp' ? -1 : 1);
				} else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
					const handled =
						this.selectAdjacentTaskHeaderItem(e.key === 'ArrowLeft' ? -1 : 1) ||
						(e.key === 'ArrowRight' && this.focusColumnFromTask(active));
					if (handled) {
						e.preventDefault();
						e.stopPropagation();
					}
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
				const viewIsActive = this.app.workspace.getActiveViewOfType(KanbanView) === this;
				const eventPathIncludesView = e.composedPath().includes(container);
				const activeElementIsInsideView = active !== null && container.contains(active);
				const documentLevelTarget =
					eventTarget === null ||
					eventTarget === fallbackWindow ||
					eventTarget === ownerDocument ||
					eventTarget === ownerDocument.body ||
					eventTarget === ownerDocument.documentElement;

				// Obsidian 会在 document 捕获阶段接管 Command+F，因此需要先在 window
				// 捕获阶段处理看板内部事件，避免它到不了下面的容器监听器。
				if (
					viewIsActive &&
					(eventPathIncludesView || activeElementIsInsideView) &&
					this.handleSearchShortcut(e)
				)
					return;

				if (
					!shouldUseTabFocusFallback({
						key: e.key,
						defaultPrevented: e.defaultPrevented,
						viewIsActive,
						eventPathIncludesView,
						activeElementIsInsideView,
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
		this.contentEl.win.requestAnimationFrame(() => {
			if (this.isClosing) return;
			this.contentEl.focus({ preventScroll: true });
		});
	}

	private getActiveElement(): HTMLElement | null {
		const ownerDocument = this.contentEl.ownerDocument;
		const ownerWindow = ownerDocument.defaultView;
		const active = ownerDocument.activeElement;
		return ownerWindow && active instanceof ownerWindow.HTMLElement ? active : null;
	}

	private handleSearchShortcut(e: KeyboardEvent): boolean {
		if (
			e.isComposing ||
			!e.metaKey ||
			e.ctrlKey ||
			e.altKey ||
			e.shiftKey ||
			e.key.toLocaleLowerCase() !== 'f'
		)
			return false;

		const target = this.contentEl.querySelector<HTMLElement>(
			'.aulyckanban-task-search-input, .aulyckanban-task-search-tag',
		);
		if (!target) return false;

		e.preventDefault();
		e.stopPropagation();
		target.focus({ preventScroll: true });
		return true;
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
		if (currentZone === 'utility') this.rememberUtilityFocusTarget(active);
		if (currentZone === 'tasks') this.rememberTaskFocusTarget(active);
		if (this.plugin.store.isShowingArchive() && currentZone !== null) {
			if (afterBlur) active?.blur();
			this.plugin.store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
			this.focusZoneAfterRender(nextZone);
			return;
		}
		const focusTarget = (): void => {
			const target = this.getFocusTarget(nextZone);
			target?.focus({ preventScroll: true });
			if (nextZone === 'tasks') target?.scrollIntoView({ block: 'nearest' });
			if (nextZone === 'view' && target) revealTaskTypeItem(target);
		};
		if (afterBlur) {
			active?.blur();
			this.contentEl.win.requestAnimationFrame(focusTarget);
		} else {
			focusTarget();
		}
	}

	private getFocusZone(element: HTMLElement | null): KanbanFocusZone | null {
		if (!element || !this.contentEl.contains(element)) return null;
		if (element.closest('.aulyckanban-utility-bar')) return 'utility';
		if (element.closest('.aulyckanban-toolbar')) return 'view';
		if (element.closest('.aulyckanban-task-pane')) return 'tasks';
		if (element.closest('.aulyckanban-category-nav')) return 'columns';
		return null;
	}

	private getFocusTarget(zone: KanbanFocusZone): HTMLElement | null {
		switch (zone) {
			case 'utility':
				return getUtilityZoneFocusTarget(this.contentEl);
			case 'view':
				return this.getCurrentTaskTypeButton();
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
			if (!store.isShowingAllTasks() || store.isShowingArchive()) {
				store.dispatch({ type: 'SHOW_ALL_TASKS' });
			}
			this.focusZoneAfterRender('view');
		} else if (target.kind === 'add') {
			const addButton = this.contentEl.querySelector<HTMLElement>('.aulyckanban-view-add-btn');
			addButton?.focus({ preventScroll: true });
			if (addButton) revealTaskTypeItem(addButton);
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
		const active = this.getActiveElement();
		if (!active || !this.contentEl.contains(active)) return null;
		if (active.closest('.aulyckanban-all-tasks-btn')) return { kind: 'all' };
		if (active.closest('.aulyckanban-view-add-btn')) return { kind: 'add' };
		const viewTab = active.closest<HTMLElement>('.aulyckanban-view-tab');
		const viewId = viewTab?.dataset['viewId'];
		return viewId ? { kind: 'view', id: viewId } : null;
	}

	private selectAdjacentColumn(offset: number): void {
		const store = this.plugin.store;
		const active = this.getActiveElement();
		let focusedTarget: ColumnNavigationTarget | null = null;
		if (active?.closest('.aulyckanban-nav-all-btn')) focusedTarget = { kind: 'all' };
		else if (active?.closest('.aulyckanban-nav-add-btn')) focusedTarget = { kind: 'add' };
		else {
			const columnId = active?.closest<HTMLElement>('.aulyckanban-nav-item')?.dataset['columnId'];
			if (columnId) focusedTarget = { kind: 'column', id: columnId };
		}
		if (
			(focusedTarget?.kind === 'all' && offset < 0) ||
			(focusedTarget?.kind === 'add' && offset > 0)
		)
			return;
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
		const active = this.getActiveElement();
		if (offset < 0 && active?.matches('.aulyckanban-task-add-btn')) {
			this.focusCurrentTaskType();
			return;
		}
		const currentIndex = active ? items.indexOf(active) : -1;
		const target = items[getWrappedItemIndex(currentIndex, items.length, offset)];
		target?.focus({ preventScroll: true });
		target?.scrollIntoView({ block: 'nearest' });
	}

	private focusTaskZone(): void {
		const target = getTaskZoneFocusTarget(this.contentEl);
		target?.focus({ preventScroll: true });
		target?.scrollIntoView({ block: 'nearest' });
	}

	private focusCurrentTaskType(): void {
		const target = this.getCurrentTaskTypeButton();
		target?.focus({ preventScroll: true });
		if (target) revealTaskTypeItem(target);
	}

	private rememberUtilityFocusTarget(active: HTMLElement | null): void {
		if (active?.closest('.aulyckanban-archive-btn')) {
			this.lastUtilityFocusTarget = 'archive';
		} else if (active?.closest('.aulyckanban-task-search-input, .aulyckanban-task-search-tag')) {
			this.lastUtilityFocusTarget = 'search';
		}
	}

	private focusRememberedUtilityTarget(): void {
		const selector =
			this.lastUtilityFocusTarget === 'archive'
				? '.aulyckanban-archive-btn'
				: this.lastUtilityFocusTarget === 'search'
					? '.aulyckanban-task-search-input, .aulyckanban-task-search-tag'
					: null;
		const target =
			(selector ? this.contentEl.querySelector<HTMLElement>(selector) : null) ??
			getUtilityZoneFocusTarget(this.contentEl);
		target?.focus({ preventScroll: true });
	}

	private focusColumnFromTask(active: HTMLElement | null): boolean {
		if (!active?.closest('.aulyckanban-task-pane')) return false;
		this.rememberTaskFocusTarget(active);
		const target = this.getFocusTarget('columns');
		if (!target) return false;
		target.focus({ preventScroll: true });
		return true;
	}

	private rememberTaskFocusTarget(active: HTMLElement | null): void {
		const task = active?.closest<HTMLElement>('.aulyckanban-task');
		const viewId = task?.dataset['viewId'];
		const columnId = task?.dataset['columnId'];
		const taskId = task?.dataset['taskId'];
		if (viewId && columnId && taskId) {
			this.lastTaskFocusTarget = { kind: 'task', viewId, columnId, taskId };
			return;
		}
		if (
			active?.closest(
				'.aulyckanban-task-add-btn, .aulyckanban-task-create-target, ' +
					'.aulyckanban-task-create-input',
			)
		) {
			this.lastTaskFocusTarget = { kind: 'add' };
		}
	}

	private focusRememberedTaskTarget(): boolean {
		const remembered = this.lastTaskFocusTarget;
		const rememberedTarget =
			remembered?.kind === 'task'
				? Array.from(this.contentEl.querySelectorAll<HTMLElement>('.aulyckanban-task')).find(
						(item) =>
							item.dataset['viewId'] === remembered.viewId &&
							item.dataset['columnId'] === remembered.columnId &&
							item.dataset['taskId'] === remembered.taskId,
					)
				: remembered?.kind === 'add'
					? this.contentEl.querySelector<HTMLElement>(
							'.aulyckanban-task-add-btn, .aulyckanban-task-create-target, ' +
								'.aulyckanban-task-create-input',
						)
					: null;
		const target = rememberedTarget ?? getTaskZoneFocusTarget(this.contentEl);
		if (!target) return false;
		target.focus({ preventScroll: true });
		target.scrollIntoView({ block: 'nearest' });
		return true;
	}

	private selectAdjacentTaskHeaderItem(offset: number): boolean {
		const items = getTaskZoneHorizontalNavigationItems(this.contentEl);
		const active = this.getActiveElement();
		const currentIndex = active ? items.indexOf(active) : -1;
		if (currentIndex < 0) return false;
		const target = items[getWrappedItemIndex(currentIndex, items.length, offset)];
		if (!target || target === active) return false;
		target.focus({ preventScroll: true });
		return true;
	}

	private selectAdjacentUtilityItem(offset: number): void {
		const items = getUtilityZoneNavigationItems(this.contentEl);
		const active = this.getActiveElement();
		const currentIndex = active ? items.indexOf(active) : -1;
		const target = items[getWrappedItemIndex(currentIndex, items.length, offset)];
		if (
			target?.matches('.aulyckanban-task-search-input, .aulyckanban-task-search-tag') &&
			this.plugin.store.isShowingArchive()
		) {
			this.plugin.store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
			this.focusSearchAfterRender();
			return;
		}
		target?.focus({ preventScroll: true });
	}

	private focusSearchAfterRender(): void {
		this.contentEl.win.requestAnimationFrame(() => {
			this.contentEl
				.querySelector<HTMLElement>('.aulyckanban-task-search-input, .aulyckanban-task-search-tag')
				?.focus({ preventScroll: true });
		});
	}

	private getCurrentTaskTypeButton(): HTMLElement | null {
		if (this.plugin.store.isShowingAllTasks()) {
			return this.contentEl.querySelector<HTMLElement>('.aulyckanban-all-tasks-btn');
		}
		const currentViewId = this.plugin.store.getCurrentView();
		return (
			Array.from(this.contentEl.querySelectorAll<HTMLElement>('.aulyckanban-view-tab')).find(
				(item) => item.dataset['viewId'] === currentViewId,
			) ?? this.contentEl.querySelector<HTMLElement>('.aulyckanban-view-tab')
		);
	}

	private focusZoneAfterRender(zone: KanbanFocusZone): void {
		this.contentEl.win.requestAnimationFrame(() => {
			const target = this.getFocusTarget(zone);
			target?.focus({ preventScroll: true });
			if (zone === 'view' && target) revealTaskTypeItem(target);
		});
	}

	private requestRender(): void {
		if (this.renderQueued) return;
		this.renderQueued = true;
		this.contentEl.win.requestAnimationFrame(() => {
			this.renderQueued = false;
			if (this.isClosing || !this.board) return;
			this.board.render();
		});
	}
}
