import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_KANBAN } from '../constants';
import { t } from '../i18n';
import type KanbanPlugin from '../main';
import { Board } from './Board';
import { clearResizeHost, updateResizeHost } from '../utils/resizeHost';
import {
	getNextFocusZone,
	getTaskTypeNavigationTarget,
	getWrappedItemIndex,
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
			const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			if (e.key === 'Tab') {
				e.preventDefault();
				e.stopPropagation();
				this.focusNextZone(e.shiftKey, active?.matches(
					'.aulyckanban-view-add-input, .aulyckanban-nav-inline-input, '
					+ '.aulyckanban-inline-input, .aulyckanban-edit-textarea',
				) ?? false);
				return;
			}

			const isEmptyTaskInputArrow = active instanceof HTMLTextAreaElement
				&& active.matches('.aulyckanban-inline-input')
				&& active.value.trim().length === 0
				&& (e.key === 'ArrowUp' || e.key === 'ArrowDown');
			if (!isEmptyTaskInputArrow && active?.matches(
				'.aulyckanban-view-add-input, .aulyckanban-nav-inline-input, '
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
	}

	async onClose(): Promise<void> {
		this.isClosing = true;
		clearResizeHost(this.resizeHostEl);
		this.resizeHostEl = null;

		if (this.tabHandler) {
			this.contentEl.removeEventListener('keydown', this.tabHandler, true);
			this.tabHandler = null;
		}

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

	private focusNextZone(reverse: boolean, afterBlur = false): void {
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const currentZone = this.getFocusZone(active);
		const nextZone = getNextFocusZone(currentZone, reverse);
		const focusTarget = (): void => {
			const target = this.getFocusTarget(nextZone);
			target?.focus({ preventScroll: true });
			if (nextZone === 'tasks') target?.scrollIntoView({ block: 'nearest' });
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
				return this.contentEl.querySelector<HTMLElement>('.aulyckanban-task')
					?? this.contentEl.querySelector<HTMLElement>('.aulyckanban-inline-input');
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
			this.contentEl.querySelector<HTMLElement>('.aulyckanban-view-add-btn')?.focus({ preventScroll: true });
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
		const items = Array.from(this.contentEl.querySelectorAll<HTMLElement>(
			'.aulyckanban-inline-input, .aulyckanban-task',
		));
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const currentIndex = active ? items.indexOf(active) : -1;
		const target = items[getWrappedItemIndex(currentIndex, items.length, offset)];
		target?.focus({ preventScroll: true });
		target?.scrollIntoView({ block: 'nearest' });
	}

	private focusZoneAfterRender(zone: KanbanFocusZone): void {
		requestAnimationFrame(() => {
			this.getFocusTarget(zone)?.focus({ preventScroll: true });
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
