import type { KanbanStore } from '../store';
import { setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n';
import { ConfirmModal } from './ConfirmModal';
import { appendAccessibleLabel } from '../utils/dom';
import { getArchivedAtTime } from '../utils/task';
import { getTaskRefKey, type TaskRef } from '../utils/taskQuery';
import { ArchiveTaskCard } from './ArchiveTaskCard';
import { TaskSelection } from './TaskSelection';
import { createTaskSelectionButtons } from './TaskSelectionToolbar';

/**
 * 归档视图组件
 * 按当前任务类型范围和象限展示归档，并保留来源任务类型与象限
 */
export class ArchiveView {
	private readonly containerEl: HTMLElement;
	private readonly app: App;
	private readonly store: KanbanStore;
	private sortOrder: 'desc' | 'asc' = 'desc';
	private readonly selection = new TaskSelection();
	private statusEl: HTMLElement | null = null;
	private selectionModeButton: HTMLButtonElement | null = null;
	private listScrollTop = 0;

	constructor(containerEl: HTMLElement, app: App, store: KanbanStore) {
		this.containerEl = containerEl;
		this.app = app;
		this.store = store;
	}

	setStatusEl(statusEl: HTMLElement): void {
		this.statusEl = statusEl;
	}

	cancelSelection(): void {
		this.selection.deactivate();
		this.renderSelectionStatus();
	}

	render(): void {
		const prevListEl = this.containerEl.querySelector<HTMLElement>('.aulyckanban-archive-list');
		if (prevListEl) {
			this.listScrollTop = prevListEl.scrollTop;
		}

		const scopeKey = this.getScopeKey();
		this.selection.resetForScope(scopeKey);
		const filtered = this.applySort(this.store.getVisibleTaskRefs());
		this.selection.prune(new Set(filtered.map(getTaskRefKey)));

		this.containerEl.empty();

		const controlsEl = this.containerEl.createDiv({ cls: 'aulyckanban-archive-controls' });
		this.renderFilters(controlsEl, filtered);
		this.renderSelectionStatus();

		if (filtered.length === 0) {
			const emptyEl = this.containerEl.createDiv({ cls: 'aulyckanban-archive-empty' });
			emptyEl.setText(this.store.getSearchKeyword() ? t('archive.noMatch') : t('archive.empty'));
			return;
		}

		const listEl = this.containerEl.createDiv({ cls: 'aulyckanban-archive-list' });

		for (const item of filtered) this.renderArchiveCard(listEl, item);
		listEl.scrollTop = this.listScrollTop;
	}

	/**
	 * 渲染筛选控件
	 */
	private renderFilters(controlsEl: HTMLElement, filteredItems: TaskRef[]): void {
		const toolbarEl = controlsEl.createDiv({ cls: 'aulyckanban-archive-toolbar' });
		this.renderSortButton(toolbarEl);
		this.renderDeleteSelectedButton(toolbarEl);

		const visibleKeys = filteredItems.map(getTaskRefKey);
		const allSelected =
			visibleKeys.length > 0 && visibleKeys.every((key) => this.selection.isSelected(key));
		const { selectionButton } = createTaskSelectionButtons(toolbarEl, {
			active: this.selection.isActive,
			hasItems: visibleKeys.length > 0,
			allSelected,
			cancelClass: 'aulyckanban-archive-cancel-selection-btn',
			selectionClass: 'aulyckanban-archive-select-mode-btn aulyckanban-archive-select-all-btn',
			onCancel: () => {
				const wasActive = this.selection.isActive;
				this.cancelSelection();
				this.render();
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

	private renderSortButton(toolbarEl: HTMLElement): void {
		const sortBtn = toolbarEl.createEl('button', {
			cls: 'aulyckanban-task-selection-btn aulyckanban-archive-sort-btn',
			attr: { type: 'button', tabindex: '-1' },
		});
		const sortLabel =
			this.sortOrder === 'desc' ? t('archive.sort.newest') : t('archive.sort.oldest');
		setIcon(sortBtn, this.sortOrder === 'desc' ? 'arrow-down-wide-narrow' : 'arrow-up-narrow-wide');
		appendAccessibleLabel(sortBtn, sortLabel);
		sortBtn.addEventListener('click', () => {
			this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
			this.render();
		});
	}

	private renderDeleteSelectedButton(toolbarEl: HTMLElement): void {
		const deleteSelectedBtn = toolbarEl.createEl('button', {
			cls: 'aulyckanban-task-selection-btn aulyckanban-archive-delete-selected-btn',
			attr: { type: 'button', tabindex: '-1' },
		});
		setIcon(deleteSelectedBtn, 'trash-2');
		appendAccessibleLabel(deleteSelectedBtn, t('archive.delete.selected'));
		deleteSelectedBtn.disabled = this.selection.size === 0;
		deleteSelectedBtn.addEventListener('click', () => {
			this.confirmDeleteSelected(this.selection.keys);
		});
	}

	private confirmDeleteSelected(keys: string[]): void {
		if (keys.length === 0) return;
		new ConfirmModal(this.app, {
			message: t('archive.confirm.deleteSelected').replace('{count}', String(keys.length)),
			isDestructive: true,
			onConfirm: () => {
				const selectedKeys = new Set(keys);
				const tasks = this.store
					.getVisibleTaskRefs()
					.filter((ref) => selectedKeys.has(getTaskRefKey(ref)))
					.map((ref) => ({ viewId: ref.viewId, taskId: ref.task.id }));
				this.selection.deactivate();
				this.store.dispatch({ type: 'DELETE_ARCHIVE_TASKS', payload: { tasks } });
			},
		}).open();
	}

	private applySort(items: TaskRef[]): TaskRef[] {
		return [...items].sort((a, b) => {
			const aTime = getArchivedAtTime(a.task);
			const bTime = getArchivedAtTime(b.task);
			return this.sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
		});
	}

	private renderArchiveCard(parentEl: HTMLElement, ref: TaskRef): void {
		const key = getTaskRefKey(ref);
		new ArchiveTaskCard(parentEl, this.app, this.store, ref, {
			selectionMode: this.selection.isActive,
			selected: this.selection.isSelected(key),
			sourceLabel: this.getSourceLabel(ref),
			onSelectionRequest: () => this.toggleTaskSelection(key),
		});
	}

	private getSourceLabel(ref: TaskRef): string {
		return `${ref.viewTitle} · ${ref.columnTitle}`;
	}

	private toggleTaskSelection(taskKey: string): void {
		this.selection.toggle(taskKey);
		this.render();
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

	private focusSelectionModeButton(): void {
		this.selectionModeButton?.focus({ preventScroll: true });
	}

	private getScopeKey(): string {
		return [
			this.store.getTaskTypeScope(),
			this.store.getCurrentView(),
			this.store.getColumnScope(),
			this.store.getActiveColumnId(),
			this.store.getSearchKeyword(),
		].join('|');
	}
}
