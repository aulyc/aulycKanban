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
		if (this.deleteMode) {
			this.renderSelectionToolbar(controlsEl, filteredItems);
			return;
		}

		const toolbarEl = controlsEl.createDiv({
			cls: 'aulyckanban-archive-toolbar aulyckanban-archive-toolbar-browse',
		});
		const sortBtn = toolbarEl.createEl('button', {
			cls: 'aulyckanban-archive-sort-btn',
			attr: { type: 'button' },
		});
		const sortLabel =
			this.sortOrder === 'desc' ? t('archive.sort.newest') : t('archive.sort.oldest');
		setIcon(sortBtn, this.sortOrder === 'desc' ? 'arrow-down' : 'arrow-up');
		appendAccessibleLabel(sortBtn, sortLabel);
		sortBtn.addEventListener('click', () => {
			this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
			this.render();
		});

		const selectBtn = toolbarEl.createEl('button', {
			cls: 'aulyckanban-archive-select-mode-btn',
			text: t('archive.delete.mode'),
			attr: { type: 'button' },
		});
		selectBtn.disabled = filteredItems.length === 0;
		selectBtn.addEventListener('click', () => {
			this.deleteMode = true;
			this.render();
		});
	}

	private renderSelectionToolbar(controlsEl: HTMLElement, filteredItems: TaskRef[]): void {
		const filteredIds = filteredItems.map(getTaskRefKey);
		const selectedCount = this.selectedTaskKeys.size;
		const allFilteredSelected =
			filteredIds.length > 0 && filteredIds.every((id) => this.selectedTaskKeys.has(id));
		const someFilteredSelected = filteredIds.some((id) => this.selectedTaskKeys.has(id));
		const toolbarEl = controlsEl.createDiv({
			cls: 'aulyckanban-archive-toolbar aulyckanban-archive-toolbar-selection',
		});

		const selectAllLabel = toolbarEl.createEl('label', { cls: 'aulyckanban-archive-select-all' });
		const selectAllCheckbox = selectAllLabel.createEl('input', {
			cls: 'aulyckanban-archive-select-checkbox',
			attr: { type: 'checkbox' },
		});
		selectAllCheckbox.checked = allFilteredSelected;
		selectAllCheckbox.indeterminate = someFilteredSelected && !allFilteredSelected;
		selectAllCheckbox.disabled = filteredIds.length === 0;
		selectAllLabel.createSpan({ text: t('archive.delete.selectAll') });
		selectAllCheckbox.addEventListener('change', () => {
			if (selectAllCheckbox.checked) {
				for (const id of filteredIds) this.selectedTaskKeys.add(id);
			} else {
				for (const id of filteredIds) this.selectedTaskKeys.delete(id);
			}
			this.render();
		});

		toolbarEl.createSpan({
			cls: 'aulyckanban-archive-selected-count',
			text: t('archive.delete.selectedCount').replace('{count}', String(selectedCount)),
		});

		const actionsEl = toolbarEl.createDiv({ cls: 'aulyckanban-archive-selection-actions' });
		const cancelBtn = actionsEl.createEl('button', {
			cls: 'aulyckanban-archive-selection-btn',
			text: t('archive.delete.cancel'),
			attr: { type: 'button' },
		});
		cancelBtn.addEventListener('click', () => {
			this.deleteMode = false;
			this.selectedTaskKeys.clear();
			this.render();
		});

		const deleteSelectedBtn = actionsEl.createEl('button', {
			cls: 'aulyckanban-archive-selection-btn aulyckanban-archive-delete-selected-btn',
			text: t('archive.delete.selected'),
			attr: { type: 'button' },
		});
		deleteSelectedBtn.disabled = selectedCount === 0;
		deleteSelectedBtn.addEventListener('click', () => {
			this.confirmDeleteSelected(Array.from(this.selectedTaskKeys));
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
		if (this.deleteMode) {
			const checkboxLabel = topEl.createEl('label', {
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
		}
		const mainEl = topEl.createDiv({ cls: 'aulyckanban-archive-task-main' });

		const contentEl = mainEl.createDiv({
			cls: 'aulyckanban-task-content aulyckanban-archive-task-title',
		});
		setTextWithLineBreaks(contentEl, task.content);

		if (!this.deleteMode) {
			const actionsEl = topEl.createDiv({ cls: 'aulyckanban-archive-task-actions' });
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
