import type { KanbanStore } from '../store';
import { setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n';
import { ConfirmModal } from './ConfirmModal';
import { formatDateTimeMinute } from '../utils/datetime';
import { appendAccessibleLabel, setTextWithLineBreaks } from '../utils/dom';
import { getArchivedAtIso, getArchivedAtTime } from '../utils/task';
import { getTaskRefKey, type TaskRef } from '../utils/taskQuery';

/**
 * 归档视图组件
 * 按当前任务类型范围和象限展示归档，并保留来源任务类型与象限
 */
export class ArchiveView {
	private readonly containerEl: HTMLElement;
	private readonly app: App;
	private readonly store: KanbanStore;
	private sortOrder: 'desc' | 'asc' = 'desc';
	private deleteMode = false;
	private readonly selectedTaskKeys = new Set<string>();
	private listScrollTop = 0;

	constructor(containerEl: HTMLElement, app: App, store: KanbanStore) {
		this.containerEl = containerEl;
		this.app = app;
		this.store = store;
	}

	render(): void {
		const prevListEl = this.containerEl.querySelector<HTMLElement>('.aulyckanban-archive-list');
		if (prevListEl) {
			this.listScrollTop = prevListEl.scrollTop;
		}

		this.containerEl.empty();

		const filtered = this.applySort(this.store.getVisibleTaskRefs());
		this.syncSelectionWithFiltered(filtered);

		const controlsEl = this.containerEl.createDiv({ cls: 'aulyckanban-archive-controls' });
		this.renderFilters(controlsEl, filtered);

		if (filtered.length === 0) {
			const emptyEl = this.containerEl.createDiv({ cls: 'aulyckanban-archive-empty' });
			emptyEl.setText(this.store.getSearchKeyword() ? t('archive.noMatch') : t('archive.empty'));
			return;
		}

		const listEl = this.containerEl.createDiv({ cls: 'aulyckanban-archive-list' });

		for (const item of filtered) {
			this.renderArchiveCard(listEl, item);
		}
		listEl.scrollTop = this.listScrollTop;
	}

	/**
	 * 渲染筛选控件
	 */
	private renderFilters(controlsEl: HTMLElement, filteredItems: TaskRef[]): void {
		const toolbarEl = controlsEl.createDiv({
			cls: [
				'aulyckanban-archive-toolbar',
				this.deleteMode
					? 'aulyckanban-archive-toolbar-selection'
					: 'aulyckanban-archive-toolbar-browse',
			].join(' '),
		});
		this.renderSortButton(toolbarEl);
		this.renderSelectionModeButton(toolbarEl, filteredItems.length > 0);
		this.renderSelectAllButton(toolbarEl, filteredItems);
		this.renderDeleteSelectedButton(toolbarEl);
		this.renderSelectedCount(toolbarEl);
	}

	private renderSortButton(toolbarEl: HTMLElement): void {
		const sortBtn = toolbarEl.createEl('button', {
			cls: 'aulyckanban-archive-sort-btn',
			attr: { type: 'button' },
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

	private renderSelectionModeButton(toolbarEl: HTMLElement, hasFilteredItems: boolean): void {
		const selectBtn = toolbarEl.createEl('button', {
			cls: this.deleteMode
				? 'aulyckanban-archive-selection-btn aulyckanban-archive-cancel-selection-btn'
				: 'aulyckanban-archive-select-mode-btn',
			attr: { type: 'button' },
		});
		setIcon(selectBtn, this.deleteMode ? 'list-x' : 'list-checks');
		appendAccessibleLabel(
			selectBtn,
			this.deleteMode ? t('archive.delete.cancel') : t('archive.delete.mode'),
		);
		selectBtn.disabled = !this.deleteMode && !hasFilteredItems;
		selectBtn.addEventListener('click', () => {
			if (this.deleteMode) this.selectedTaskKeys.clear();
			this.deleteMode = !this.deleteMode;
			this.render();
		});
	}

	private renderSelectAllButton(toolbarEl: HTMLElement, filteredItems: TaskRef[]): void {
		const filteredIds = filteredItems.map(getTaskRefKey);
		const selectedCount = this.selectedTaskKeys.size;
		const shouldClearSelection = this.deleteMode && selectedCount > 0;
		const selectAllBtn = toolbarEl.createEl('button', {
			cls: [
				'aulyckanban-archive-selection-btn',
				'aulyckanban-archive-select-all-btn',
				shouldClearSelection ? 'aulyckanban-archive-clear-all-btn' : '',
			]
				.filter(Boolean)
				.join(' '),
			attr: { type: 'button' },
		});
		setIcon(selectAllBtn, shouldClearSelection ? 'square-x' : 'check-check');
		appendAccessibleLabel(
			selectAllBtn,
			shouldClearSelection ? t('archive.delete.clearAll') : t('archive.delete.selectAll'),
		);
		selectAllBtn.disabled = filteredIds.length === 0;
		selectAllBtn.addEventListener('click', () => {
			if (shouldClearSelection) {
				for (const id of filteredIds) this.selectedTaskKeys.delete(id);
			} else {
				this.deleteMode = true;
				for (const id of filteredIds) this.selectedTaskKeys.add(id);
			}
			this.render();
		});
	}

	private renderDeleteSelectedButton(toolbarEl: HTMLElement): void {
		const selectedCount = this.selectedTaskKeys.size;
		const deleteSelectedBtn = toolbarEl.createEl('button', {
			cls: 'aulyckanban-archive-selection-btn aulyckanban-archive-delete-selected-btn',
			attr: { type: 'button' },
		});
		setIcon(deleteSelectedBtn, 'trash-2');
		appendAccessibleLabel(deleteSelectedBtn, t('archive.delete.selected'));
		deleteSelectedBtn.disabled = selectedCount === 0;
		deleteSelectedBtn.addEventListener('click', () => {
			this.confirmDeleteSelected(Array.from(this.selectedTaskKeys));
		});
	}

	private renderSelectedCount(toolbarEl: HTMLElement): void {
		const selectedCount = this.selectedTaskKeys.size;
		const [beforeCount = '', afterCount = ''] = t('archive.delete.selectedCount').split('{count}');
		const selectedCountEl = toolbarEl.createSpan({
			cls: 'aulyckanban-archive-selected-count',
		});
		selectedCountEl.createSpan({ text: beforeCount });
		selectedCountEl.createSpan({
			cls: 'aulyckanban-archive-selected-count-value',
			text: String(selectedCount),
		});
		selectedCountEl.createSpan({ text: afterCount });
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
				this.selectedTaskKeys.clear();
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

	private syncSelectionWithFiltered(filteredItems: TaskRef[]): void {
		if (!this.deleteMode) return;
		const validIds = new Set(filteredItems.map(getTaskRefKey));
		for (const id of Array.from(this.selectedTaskKeys)) {
			if (!validIds.has(id)) this.selectedTaskKeys.delete(id);
		}
	}

	private renderArchiveCard(parentEl: HTMLElement, ref: TaskRef): void {
		const { task } = ref;
		const key = getTaskRefKey(ref);
		const isSelected = this.selectedTaskKeys.has(key);
		const cardEl = parentEl.createDiv({
			cls: [
				'aulyckanban-task',
				'aulyckanban-archive-task',
				this.deleteMode ? 'aulyckanban-archive-task-selecting' : '',
				isSelected ? 'aulyckanban-archive-task-selected' : '',
			]
				.filter(Boolean)
				.join(' '),
			attr: { tabindex: '-1' },
		});
		cardEl.dataset['viewId'] = ref.viewId;
		cardEl.dataset['columnId'] = ref.columnId;
		cardEl.dataset['taskId'] = task.id;
		if (this.deleteMode) {
			cardEl.setAttribute('role', 'checkbox');
			cardEl.setAttribute('aria-checked', String(isSelected));
			cardEl.addEventListener('click', (event: MouseEvent) => {
				const target = event.target;
				if (target instanceof Element && target.closest('input, button')) return;
				this.toggleTaskSelection(key);
			});
		}

		const topEl = cardEl.createDiv({ cls: 'aulyckanban-archive-task-top' });
		const mainEl = topEl.createDiv({ cls: 'aulyckanban-archive-task-main' });

		const contentEl = mainEl.createDiv({
			cls: 'aulyckanban-task-content aulyckanban-archive-task-title',
		});
		setTextWithLineBreaks(contentEl, task.content);

		const actionsEl = topEl.createDiv({ cls: 'aulyckanban-archive-task-actions' });
		if (this.deleteMode) {
			const checkboxLabel = actionsEl.createEl('label', {
				cls: 'aulyckanban-archive-select-label',
			});
			const checkbox = checkboxLabel.createEl('input', {
				attr: { type: 'checkbox' },
				cls: 'aulyckanban-archive-select-checkbox',
			});
			appendAccessibleLabel(checkboxLabel, t('archive.delete.selectTask'));
			checkbox.checked = isSelected;
			checkboxLabel.addEventListener('click', (event: MouseEvent) => event.stopPropagation());
			checkbox.addEventListener('click', (event: MouseEvent) => event.stopPropagation());
			checkbox.addEventListener('change', () => this.toggleTaskSelection(key));
		} else {
			const restoreBtn = actionsEl.createEl('button', {
				cls: 'aulyckanban-archive-restore-btn',
				attr: { type: 'button' },
			});
			setIcon(restoreBtn, 'rotate-ccw');
			appendAccessibleLabel(restoreBtn, t('archive.restore'));
			restoreBtn.addEventListener('click', (event: MouseEvent) => {
				event.stopPropagation();
				new ConfirmModal(this.app, {
					message: t('archive.confirm.restore'),
					onConfirm: () =>
						this.store.dispatch({
							type: 'RESTORE_TASK',
							payload: { viewId: ref.viewId, taskId: task.id },
						}),
				}).open();
			});
		}

		const metaEl = cardEl.createDiv({ cls: 'aulyckanban-archive-task-meta' });
		metaEl.createSpan({
			cls: 'aulyckanban-archive-meta-item',
			text: ref.viewTitle,
		});
		metaEl.createSpan({ cls: 'aulyckanban-archive-meta-separator', text: '·' });
		metaEl.createSpan({
			cls: 'aulyckanban-archive-meta-item',
			text: ref.columnTitle,
		});
		metaEl.createSpan({ cls: 'aulyckanban-archive-meta-separator', text: '·' });
		metaEl.createSpan({
			cls: 'aulyckanban-task-time aulyckanban-archive-task-time',
			text: `${t('archive.archivedAt')} ${formatDateTimeMinute(getArchivedAtIso(task))}`,
		});
	}

	private toggleTaskSelection(taskKey: string): void {
		if (this.selectedTaskKeys.has(taskKey)) this.selectedTaskKeys.delete(taskKey);
		else this.selectedTaskKeys.add(taskKey);
		this.render();
	}
}
