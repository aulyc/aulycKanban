import { Menu, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { KanbanStore } from '../store';
import type { TaskCoordinate } from '../types';
import type { TaskRef } from '../utils/taskQuery';
import { getTaskRefKey } from '../utils/taskQuery';
import { t } from '../i18n';
import { TaskCard } from './TaskCard';
import { TaskDrag } from './TaskDrag';
import { TaskMoveModal, type TaskMoveTarget } from './TaskMoveModal';
import { TaskSelection } from './TaskSelection';
import { createTaskSelectionButtons } from './TaskSelectionToolbar';

/** 当前任务范围与象限范围交叉后的未归档任务列表。 */
export class TaskList {
	private readonly el: HTMLElement;
	private readonly app: App;
	private readonly store: KanbanStore;
	private readonly selectionControlsEl: HTMLElement;
	private statusEl: HTMLElement | null = null;
	private readonly scrollTopByScope = new Map<string, number>();
	private cardCache = new Map<string, { el: HTMLElement; snapshot: string }>();
	private selectionModeButton: HTMLButtonElement | null = null;
	private readonly selection = new TaskSelection();
	private readonly drag: TaskDrag;

	constructor(
		parentEl: HTMLElement,
		app: App,
		store: KanbanStore,
		drag = new TaskDrag(),
		selectionControlsEl?: HTMLElement,
	) {
		this.app = app;
		this.store = store;
		this.drag = drag;
		this.drag.setDropHandler((tasks, target) => this.moveCoordinates(tasks, target));
		this.selectionControlsEl =
			selectionControlsEl ?? parentEl.createDiv({ cls: 'aulyckanban-task-selection-controls' });
		this.el = parentEl.createDiv({ cls: 'aulyckanban-task-list' });
	}

	setStatusEl(statusEl: HTMLElement): void {
		this.statusEl = statusEl;
	}

	cancelSelection(): void {
		if (!this.selection.isActive) return;
		this.selection.deactivate();
		this.render();
	}

	render(): void {
		const previousScopeKey = this.el.dataset['scopeKey'] ?? '';
		const previousTasksEl = this.el.querySelector<HTMLElement>('.aulyckanban-tasks');
		if (previousScopeKey && previousTasksEl) {
			this.scrollTopByScope.set(previousScopeKey, previousTasksEl.scrollTop);
		}

		this.el.empty();
		this.selectionControlsEl.empty();
		const scopeKey = this.getScopeKey();
		this.el.dataset['scopeKey'] = scopeKey;
		this.selection.resetForScope(scopeKey);
		const refs = this.store.getVisibleTaskRefs();
		this.selection.prune(new Set(refs.map(getTaskRefKey)));
		this.renderSelectionToolbar(refs);
		this.renderSelectionStatus();
		if (refs.length === 0) {
			this.cardCache.clear();
			this.el.createDiv({
				text: this.store.getSearchKeyword() ? t('task.search.noMatch') : t('md.noTasks'),
				cls: 'aulyckanban-task-list-empty',
			});
			return;
		}

		const tasksEl = this.el.createDiv({ cls: 'aulyckanban-tasks' });
		const nextCache = new Map<string, { el: HTMLElement; snapshot: string }>();
		for (const ref of refs) {
			const key = getTaskRefKey(ref);
			const sourceLabel = this.getSourceLabel(ref);
			const selected = this.selection.isSelected(key);
			const selectionMode = this.selection.isActive;
			const snapshot = `${key}|${ref.task.content}|${ref.task.completed}|${ref.task.updatedAt ?? ''}|${ref.task.createdAt}|${sourceLabel ?? ''}|${selectionMode}|${selected}`;
			const cached = this.cardCache.get(key);
			if (cached?.snapshot === snapshot) {
				tasksEl.appendChild(cached.el);
				nextCache.set(key, cached);
				continue;
			}
			const card = new TaskCard(
				tasksEl,
				this.app,
				this.store,
				ref.viewId,
				ref.columnId,
				ref.task,
				sourceLabel,
				{
					selectionMode,
					selected,
					onSelectionRequest: (event) => this.handleSelectionRequest(ref, refs, event),
					onContextMenu: (event) => this.showTaskMenu(event, ref, refs),
					onDragStart: (event) => this.handleDragStart(ref, refs, event),
					onDragEnd: () => this.drag.cancel(),
				},
			);
			const cardEl = card.getEl();
			nextCache.set(key, { el: cardEl, snapshot });
		}
		this.cardCache = nextCache;

		const savedScrollTop = this.scrollTopByScope.get(scopeKey);
		if (savedScrollTop !== undefined) tasksEl.scrollTop = savedScrollTop;
	}

	private renderSelectionToolbar(refs: readonly TaskRef[]): void {
		const toolbarEl = this.selectionControlsEl.createDiv({
			cls: `aulyckanban-task-selection-toolbar${
				this.selection.isActive ? ' aulyckanban-task-selection-toolbar-active' : ''
			}`,
		});
		const visibleKeys = refs.map(getTaskRefKey);
		const allSelected =
			visibleKeys.length > 0 && visibleKeys.every((key) => this.selection.isSelected(key));
		const { selectionButton } = createTaskSelectionButtons(toolbarEl, {
			active: this.selection.isActive,
			hasItems: visibleKeys.length > 0,
			allSelected,
			cancelClass: 'aulyckanban-task-cancel-selection-btn',
			selectionClass: 'aulyckanban-task-select-mode-btn aulyckanban-task-select-all-btn',
			onCancel: () => {
				const wasActive = this.selection.isActive;
				this.cancelSelection();
				if (wasActive) this.focusSelectionModeButton();
			},
			onSelect: () => {
				if (this.selection.isActive) this.selection.selectAll(visibleKeys);
				else this.selection.activate();
				this.render();
				this.focusSelectionModeButton();
			},
		});
		this.selectionModeButton = selectionButton;
	}

	private renderSelectionStatus(): void {
		if (!this.statusEl) return;
		this.statusEl.empty();
		if (!this.selection.isActive) return;
		this.statusEl.createSpan({
			cls: 'aulyckanban-board-footer-selection',
			text: t('task.select.count').replace('{count}', String(this.selection.size)),
		});
	}

	private handleSelectionRequest(
		ref: TaskRef,
		visibleRefs: readonly TaskRef[],
		event: MouseEvent | KeyboardEvent,
	): void {
		const key = getTaskRefKey(ref);
		if (event.shiftKey) {
			this.selection.selectRange(key, visibleRefs.map(getTaskRefKey));
		} else {
			this.selection.toggle(key);
		}
		this.render();
		this.cardCache.get(key)?.el.focus({ preventScroll: true });
	}

	private focusSelectionModeButton(): void {
		this.selectionModeButton?.focus({ preventScroll: true });
	}

	private showTaskMenu(event: MouseEvent, ref: TaskRef, visibleRefs: readonly TaskRef[]): void {
		const key = getTaskRefKey(ref);
		let targets = [ref];
		if (this.selection.isActive) {
			if (!this.selection.isSelected(key)) {
				this.selection.selectOnly(key);
				this.render();
			}
			targets = this.getSelectedRefs(visibleRefs);
		}
		const menu = new Menu();
		menu.addItem((item) => {
			item
				.setTitle(targets.length > 1 ? t('task.move.selected') : t('task.move.menu'))
				.setIcon('move')
				.onClick(() => this.openMoveModal(targets));
		});
		menu.showAtMouseEvent(event);
	}

	private getSelectedRefs(visibleRefs: readonly TaskRef[]): TaskRef[] {
		return visibleRefs.filter((ref) => this.selection.isSelected(getTaskRefKey(ref)));
	}

	private openMoveModal(refs: readonly TaskRef[]): void {
		if (refs.length === 0) return;
		const initialViewId = this.getCommonValue(refs.map((ref) => ref.viewId));
		const initialColumnId = this.getCommonValue(refs.map((ref) => ref.columnId));
		new TaskMoveModal(this.app, {
			taskCount: refs.length,
			views: this.store.getTaskViews().map((view) => ({ id: view.id, title: view.title })),
			columns: this.store
				.getCurrentColumns()
				.map((column) => ({ id: column.id, title: column.title })),
			initialViewId,
			initialColumnId,
			onMove: (target) => this.moveTasks(refs, target),
		}).open();
	}

	private moveTasks(refs: readonly TaskRef[], target: TaskMoveTarget): void {
		const coordinates: TaskCoordinate[] = refs.map((ref) => ({
			viewId: ref.viewId,
			columnId: ref.columnId,
			taskId: ref.task.id,
		}));
		this.moveCoordinates(coordinates, target);
	}

	private moveCoordinates(coordinates: readonly TaskCoordinate[], target: TaskMoveTarget): void {
		const changesDestination = coordinates.some(
			(coordinate) =>
				(target.targetViewId !== undefined && target.targetViewId !== coordinate.viewId) ||
				(target.targetColumnId !== undefined && target.targetColumnId !== coordinate.columnId),
		);
		if (!changesDestination) return;
		this.store.dispatch({
			type: 'MOVE_TASKS',
			payload: {
				tasks: coordinates,
				targetViewId: target.targetViewId,
				targetColumnId: target.targetColumnId,
			},
		});
		if (!this.store.lastActionMutatedData) {
			new Notice(t('task.move.failed'));
			return;
		}
		this.selection.deactivate();
		new Notice(t('task.move.success').replace('{count}', String(coordinates.length)));
		this.render();
	}

	private handleDragStart(ref: TaskRef, visibleRefs: readonly TaskRef[], event: DragEvent): number {
		const key = getTaskRefKey(ref);
		const draggedRefs =
			this.selection.isActive && this.selection.isSelected(key)
				? this.getSelectedRefs(visibleRefs)
				: [ref];
		if (this.selection.isActive && !this.selection.isSelected(key)) this.selection.deactivate();
		const coordinates = draggedRefs.map((item) => ({
			viewId: item.viewId,
			columnId: item.columnId,
			taskId: item.task.id,
		}));
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData(
				'text/plain',
				t('task.drag.count').replace('{count}', String(coordinates.length)),
			);
		}
		this.drag.start(coordinates);
		return coordinates.length;
	}

	private getCommonValue(values: readonly string[]): string | null {
		const first = values[0];
		return first !== undefined && values.every((value) => value === first) ? first : null;
	}

	private getScopeKey(): string {
		return [
			this.store.getTaskScope(),
			this.store.getCurrentView(),
			this.store.getColumnScope(),
			this.store.getActiveColumnId(),
			this.store.getSearchKeyword(),
		].join('|');
	}

	private getSourceLabel(ref: TaskRef): string {
		return `${ref.viewTitle} · ${ref.columnTitle}`;
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
