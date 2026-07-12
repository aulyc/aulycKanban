import type { Task, ViewKind } from '../types';
import type { KanbanStore } from '../store';
import { setIcon } from 'obsidian';
import { t } from '../i18n';
import { formatDateTimeMinute } from '../utils/datetime';
import { setTextWithLineBreaks } from '../utils/dom';
import { ARCHIVE_UNCATEGORIZED_ID } from '../constants';

/**
 * 归档视图组件
 * 合并展示全部任务类型的归档，并保留来源任务类型与象限
 */
export class ArchiveView {
	private readonly containerEl: HTMLElement;
	private readonly store: KanbanStore;
	private selectedCategory = 'all';
	private sortOrder: 'desc' | 'asc' = 'desc';
	private searchKeyword = '';
	private searchInputValue = '';
	private deleteMode = false;
	private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly selectedTaskIds = new Set<string>();
	private listScrollTop = 0;

	constructor(containerEl: HTMLElement, store: KanbanStore) {
		this.containerEl = containerEl;
		this.store = store;
	}

	render(): void {
		const prevListEl = this.containerEl.querySelector<HTMLElement>('.aulyckanban-archive-list');
		const prevSearchInput = this.containerEl.querySelector<HTMLInputElement>('.aulyckanban-archive-search');
		const restoreSearchFocus = document.activeElement === prevSearchInput;
		const searchSelectionStart = prevSearchInput?.selectionStart ?? null;
		const searchSelectionEnd = prevSearchInput?.selectionEnd ?? null;
		if (prevListEl) {
			this.listScrollTop = prevListEl.scrollTop;
		}

		this.containerEl.empty();

		const boardData = this.store.getBoardData();
		const allItems = this.buildArchiveItems();
		const filtered = this.applyFilters(allItems);
		this.syncSelectionWithFiltered(filtered);

		const controlsEl = this.containerEl.createDiv({ cls: 'aulyckanban-archive-controls' });
		this.renderFilters(
			controlsEl,
			boardData,
			allItems,
			filtered,
			restoreSearchFocus,
			searchSelectionStart,
			searchSelectionEnd,
		);

		if (allItems.length === 0) {
			const emptyEl = this.containerEl.createDiv({ cls: 'aulyckanban-archive-empty' });
			emptyEl.setText(t('archive.empty'));
			return;
		}

		const listEl = this.containerEl.createDiv({ cls: 'aulyckanban-archive-list' });

		if (filtered.length === 0) {
			const emptyEl = listEl.createDiv({ cls: 'aulyckanban-archive-empty' });
			emptyEl.setText(t('archive.noMatch'));
			return;
		}

		for (const item of filtered) {
			this.renderArchiveCard(listEl, item.task, item.viewKind, boardData);
		}
		listEl.scrollTop = this.listScrollTop;
	}

	/**
	 * 渲染筛选控件
	 */
	private renderFilters(
		controlsEl: HTMLElement,
		boardData: Readonly<ReturnType<KanbanStore['getBoardData']>>,
		allItems: Array<{ task: Task; viewKind: ViewKind }>,
		filteredItems: Array<{ task: Task; viewKind: ViewKind }>,
		restoreSearchFocus: boolean,
		searchSelectionStart: number | null,
		searchSelectionEnd: number | null,
	): void {
		const filterRow = controlsEl.createDiv({ cls: 'aulyckanban-archive-controls-row' });
		const categorySelect = filterRow.createEl('select', { cls: 'aulyckanban-archive-filter-select' });
		categorySelect.setAttribute('aria-label', t('archive.filter.category'));
		this.addOption(
			categorySelect,
			'all',
			`${t('archive.filter.category')}：${t('archive.filter.allCategories')}`,
		);
		this.populateCategoryOptions(categorySelect, boardData);
		categorySelect.value = this.selectedCategory;
		categorySelect.addEventListener('change', () => {
			this.selectedCategory = categorySelect.value;
			this.render();
		});

		const sortSelect = filterRow.createEl('select', { cls: 'aulyckanban-archive-filter-select' });
		sortSelect.setAttribute('aria-label', t('archive.sort.label'));
		this.addOption(sortSelect, 'desc', `${t('archive.sort.label')}：${t('archive.sort.newest')}`);
		this.addOption(sortSelect, 'asc', `${t('archive.sort.label')}：${t('archive.sort.oldest')}`);
		sortSelect.value = this.sortOrder;
		sortSelect.addEventListener('change', () => {
			this.sortOrder = sortSelect.value as 'desc' | 'asc';
			this.render();
		});

		const searchRow = controlsEl.createDiv({ cls: 'aulyckanban-archive-controls-row' });
		const bottomRow = searchRow;
		const deleteModeBtn = document.createElement('button');
		deleteModeBtn.className = 'aulyckanban-archive-delete-mode-btn aulyckanban-tab';
		deleteModeBtn.textContent = this.deleteMode ? t('archive.delete.exitMode') : t('archive.delete.mode');
		deleteModeBtn.addEventListener('click', () => {
			this.deleteMode = !this.deleteMode;
			if (!this.deleteMode) {
				this.selectedTaskIds.clear();
			}
			this.render();
		});

		const actionRow = controlsEl.createDiv({ cls: 'aulyckanban-archive-controls-row' });
		actionRow.appendChild(deleteModeBtn);

		if (this.deleteMode) {
			const filteredIds = filteredItems.map((item) => item.task.id);
			const allFilteredSelected =
				filteredIds.length > 0 && filteredIds.every((id) => this.selectedTaskIds.has(id));

			const selectAllBtn = actionRow.createEl('button', { cls: 'aulyckanban-archive-batch-btn' });
			selectAllBtn.setText(allFilteredSelected ? t('archive.delete.unselectAll') : t('archive.delete.selectAll'));
			selectAllBtn.disabled = filteredIds.length === 0;
			selectAllBtn.addEventListener('click', () => {
				if (allFilteredSelected) {
					for (const id of filteredIds) this.selectedTaskIds.delete(id);
				} else {
					for (const id of filteredIds) this.selectedTaskIds.add(id);
				}
				this.render();
			});

			const deleteSelectedBtn = actionRow.createEl('button', { cls: 'aulyckanban-archive-batch-btn' });
			deleteSelectedBtn.setText(t('archive.delete.selected'));
			deleteSelectedBtn.disabled = this.selectedTaskIds.size === 0;
			deleteSelectedBtn.addEventListener('click', () => {
				const ids = Array.from(this.selectedTaskIds);
				if (ids.length === 0) return;
				if (!confirm(t('archive.confirm.deleteSelected'))) return;
				this.selectedTaskIds.clear();
				this.store.dispatch({ type: 'DELETE_ARCHIVE_TASKS', payload: { taskIds: ids } });
			});

			const deleteAllBtn = actionRow.createEl('button', { cls: 'aulyckanban-archive-batch-btn aulyckanban-archive-danger-btn' });
			deleteAllBtn.setText(t('archive.delete.all'));
			deleteAllBtn.disabled = allItems.length === 0;
			deleteAllBtn.addEventListener('click', () => {
				const allIds = allItems.map((item) => item.task.id);
				if (allIds.length === 0) return;
				if (!confirm(t('archive.confirm.deleteAll'))) return;
				this.selectedTaskIds.clear();
				this.store.dispatch({ type: 'DELETE_ARCHIVE_TASKS', payload: { taskIds: allIds } });
			});
		}
		const searchInput = bottomRow.createEl('input', {
			cls: 'aulyckanban-archive-search',
			attr: { type: 'text', placeholder: t('archive.searchPlaceholder') },
		});
		searchInput.value = this.searchInputValue;

		let composing = false;
		searchInput.addEventListener('compositionstart', () => {
			composing = true;
		});
		searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key !== 'Enter') return;
			if (composing || e.isComposing) return;
			e.preventDefault();
			if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
			this.searchKeyword = this.searchInputValue.trim();
			this.render();
		});

		const clearBtn = bottomRow.createEl('button', { cls: 'aulyckanban-archive-clear-btn' });
		clearBtn.setText(t('archive.searchClear'));
		const updateClearButtonState = (): void => {
			clearBtn.disabled = !this.searchKeyword && !this.searchInputValue;
		};
		updateClearButtonState();
		clearBtn.addEventListener('click', () => {
			if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
			this.searchInputValue = '';
			this.searchKeyword = '';
			this.render();
		});
		searchInput.addEventListener('input', () => {
			this.searchInputValue = searchInput.value;
			updateClearButtonState();
			if (composing) return;
			if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
			this.searchDebounceTimer = setTimeout(() => {
				this.searchDebounceTimer = null;
				this.searchKeyword = this.searchInputValue.trim();
				this.render();
			}, 300);
		});
		searchInput.addEventListener('compositionend', () => {
			composing = false;
			if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
			this.searchDebounceTimer = setTimeout(() => {
				this.searchDebounceTimer = null;
				this.searchKeyword = this.searchInputValue.trim();
				this.render();
			}, 300);
		});

		if (restoreSearchFocus) {
			requestAnimationFrame(() => {
				searchInput.focus({ preventScroll: true });
				if (searchSelectionStart !== null && searchSelectionEnd !== null) {
					searchInput.setSelectionRange(searchSelectionStart, searchSelectionEnd);
				}
			});
		}

	}

	private addOption(selectEl: HTMLSelectElement, value: string, label: string): void {
		const option = document.createElement('option');
		option.value = value;
		option.text = label;
		selectEl.add(option);
	}

	private populateCategoryOptions(
		selectEl: HTMLSelectElement,
		boardData: Readonly<ReturnType<KanbanStore['getBoardData']>>,
	): void {
		for (const col of boardData.views[0]?.columns ?? []) {
			this.addOption(selectEl, col.id, col.title);
		}
		this.addOption(selectEl, ARCHIVE_UNCATEGORIZED_ID, t('archive.other'));
	}

	private buildArchiveItems(): Array<{
		task: Task;
		viewKind: ViewKind;
	}> {
		return this.store.getTaskViews().flatMap((view) =>
			this.store.getArchive(view.id).map((task) => ({ task, viewKind: view.id })),
		);
	}

	private applyFilters(
		items: Array<{ task: Task; viewKind: ViewKind }>,
	): Array<{ task: Task; viewKind: ViewKind }> {
		const keyword = this.searchKeyword.trim().toLowerCase();
		const filtered = items.filter(({ task }) => {
			if (this.selectedCategory !== 'all') {
				const sourceCol = task.sourceColumnId ?? ARCHIVE_UNCATEGORIZED_ID;
				if (this.selectedCategory !== sourceCol) return false;
			}
			if (keyword && !task.content.toLowerCase().includes(keyword)) return false;
			return true;
		});

		filtered.sort((a, b) => {
			const aTime = this.getTaskTime(a.task);
			const bTime = this.getTaskTime(b.task);
			return this.sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
		});

		return filtered;
	}

	private getTaskTime(task: Task): number {
		return new Date(task.archivedAt ?? task.completedAt ?? task.createdAt).getTime();
	}

	private syncSelectionWithFiltered(filteredItems: Array<{ task: Task; viewKind: ViewKind }>): void {
		if (!this.deleteMode) return;
		const validIds = new Set(filteredItems.map((item) => item.task.id));
		for (const id of Array.from(this.selectedTaskIds)) {
			if (!validIds.has(id)) this.selectedTaskIds.delete(id);
		}
	}

	private resolveTaskCategory(
		task: Task,
		_viewKind: ViewKind,
		boardData: Readonly<ReturnType<KanbanStore['getBoardData']>>,
	): string {
		const sourceColId = task.sourceColumnId ?? ARCHIVE_UNCATEGORIZED_ID;
		if (sourceColId === ARCHIVE_UNCATEGORIZED_ID) {
			return t('archive.other');
		}
		const matched = boardData.views[0]?.columns.find((col) => col.id === sourceColId);
		return matched?.title ?? t('archive.other');
	}

	private renderArchiveCard(
		parentEl: HTMLElement,
		task: Task,
		viewKind: ViewKind,
		boardData: Readonly<ReturnType<KanbanStore['getBoardData']>>,
	): void {
		const cardEl = parentEl.createDiv({ cls: 'aulyckanban-task aulyckanban-archive-task' });

		const topEl = cardEl.createDiv({ cls: 'aulyckanban-archive-task-top' });
		const mainEl = topEl.createDiv({ cls: 'aulyckanban-archive-task-main' });

		const contentEl = mainEl.createDiv({ cls: 'aulyckanban-task-content aulyckanban-task-content-completed' });
		setTextWithLineBreaks(contentEl, task.content);

		const actionsEl = topEl.createDiv({ cls: 'aulyckanban-archive-task-actions' });
		if (this.deleteMode) {
			const checkbox = actionsEl.createEl('input', {
				attr: { type: 'checkbox', 'aria-label': t('archive.delete.selectTask') },
				cls: 'aulyckanban-archive-select-checkbox',
			});
			checkbox.checked = this.selectedTaskIds.has(task.id);
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) this.selectedTaskIds.add(task.id);
				else this.selectedTaskIds.delete(task.id);
				this.render();
			});
		}

		const restoreBtn = actionsEl.createEl('button', {
			cls: 'aulyckanban-archive-restore-btn',
		});
		restoreBtn.setAttribute('aria-label', t('archive.restore'));
		setIcon(restoreBtn, 'rotate-ccw');
		restoreBtn.disabled = this.deleteMode;
		restoreBtn.addEventListener('click', (e: MouseEvent) => {
			if (this.deleteMode) return;
			e.stopPropagation();
			if (!confirm(t('archive.confirm.restore'))) return;
			// 恢复时需要先切换到对应视图
			const currentView = this.store.getCurrentView();
			if (currentView !== viewKind) {
				this.store.dispatch({ type: 'SWITCH_VIEW', payload: { view: viewKind } });
				// SWITCH_VIEW 会把 showArchive 设为 false，需要重新打开
				this.store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
			}
			this.store.dispatch({
				type: 'RESTORE_TASK',
				payload: { taskId: task.id },
			});
		});

		const bottomEl = cardEl.createDiv({ cls: 'aulyckanban-archive-task-bottom' });
		const tagsEl = bottomEl.createDiv({ cls: 'aulyckanban-archive-task-tags' });
		tagsEl.createSpan({
			cls: 'aulyckanban-archive-tag',
			text: boardData.views.find((view) => view.id === viewKind)?.title ?? viewKind,
		});
		tagsEl.createSpan({
			cls: 'aulyckanban-archive-tag',
			text: this.resolveTaskCategory(task, viewKind, boardData),
		});
		const archiveTime = task.archivedAt ?? task.completedAt ?? task.createdAt;
		const timeEl = bottomEl.createDiv({ cls: 'aulyckanban-task-time aulyckanban-archive-task-time' });
		timeEl.setText(`${t('archive.archivedAt')} ${this.formatTime(archiveTime)}`);
	}

	private formatTime(isoStr: string): string {
		return formatDateTimeMinute(isoStr);
	}

}
