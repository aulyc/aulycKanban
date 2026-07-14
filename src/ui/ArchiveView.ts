import type { Task, ViewKind } from '../types';
import type { KanbanStore } from '../store';
import { Menu, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { t } from '../i18n';
import { ConfirmModal } from './ConfirmModal';
import { formatDateTimeMinute } from '../utils/datetime';
import { appendAccessibleLabel, setTextWithLineBreaks } from '../utils/dom';
import { getArchivedAtIso, getArchivedAtTime } from '../utils/task';
import { createInlineInput } from './InlineInput';
import { ARCHIVE_UNCATEGORIZED_ID } from '../constants';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * 归档视图组件
 * 合并展示全部任务类型的归档，并保留来源任务类型与象限
 */
export class ArchiveView {
	private readonly containerEl: HTMLElement;
	private readonly app: App;
	private readonly store: KanbanStore;
	private sortOrder: 'desc' | 'asc' = 'desc';
	private searchKeyword = '';
	private searchInputValue = '';
	private deleteMode = false;
	private readonly selectedTaskIds = new Set<string>();
	private listScrollTop = 0;

	constructor(containerEl: HTMLElement, app: App, store: KanbanStore) {
		this.containerEl = containerEl;
		this.app = app;
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
		filteredItems: Array<{ task: Task; viewKind: ViewKind }>,
		restoreSearchFocus: boolean,
		searchSelectionStart: number | null,
		searchSelectionEnd: number | null,
	): void {
		if (this.deleteMode) {
			this.renderSelectionToolbar(controlsEl, filteredItems);
			return;
		}

		const toolbarEl = controlsEl.createDiv({
			cls: 'aulyckanban-archive-toolbar aulyckanban-archive-toolbar-browse',
		});
		const searchShellEl = toolbarEl.createDiv({ cls: 'aulyckanban-archive-search-shell' });
		let clearBtn: HTMLButtonElement | null = null;
		createInlineInput(searchShellEl, {
			cls: 'aulyckanban-archive-search',
			placeholder: t('archive.searchPlaceholder'),
			initialValue: this.searchInputValue,
			persistent: true,
			debounceMs: SEARCH_DEBOUNCE_MS,
			focusOnMount: restoreSearchFocus,
			...(searchSelectionStart !== null && searchSelectionEnd !== null
				? { selection: { start: searchSelectionStart, end: searchSelectionEnd } }
				: {}),
			onInput: (value) => {
				this.searchInputValue = value;
				if (clearBtn) clearBtn.hidden = !this.searchKeyword && !value;
			},
			onDebounced: (value) => this.applySearch(value),
			onCommit: (value) => this.applySearch(value),
		});

		clearBtn = searchShellEl.createEl('button', {
			cls: 'aulyckanban-archive-clear-btn',
			attr: { type: 'button' },
		});
		setIcon(clearBtn, 'x');
		appendAccessibleLabel(clearBtn, t('archive.searchClear'));
		clearBtn.hidden = !this.searchKeyword && !this.searchInputValue;
		clearBtn.addEventListener('click', () => {
			this.searchInputValue = '';
			this.searchKeyword = '';
			this.render();
		});

		const sortBtn = toolbarEl.createEl('button', {
			cls: 'aulyckanban-archive-sort-btn',
			attr: { type: 'button' },
		});
		const sortLabel = this.sortOrder === 'desc'
			? t('archive.sort.newest')
			: t('archive.sort.oldest');
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

	private renderSelectionToolbar(
		controlsEl: HTMLElement,
		filteredItems: Array<{ task: Task; viewKind: ViewKind }>,
	): void {
		const filteredIds = filteredItems.map((item) => item.task.id);
		const selectedCount = this.selectedTaskIds.size;
		const allFilteredSelected = filteredIds.length > 0
			&& filteredIds.every((id) => this.selectedTaskIds.has(id));
		const someFilteredSelected = filteredIds.some((id) => this.selectedTaskIds.has(id));
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
				for (const id of filteredIds) this.selectedTaskIds.add(id);
			} else {
				for (const id of filteredIds) this.selectedTaskIds.delete(id);
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
			this.selectedTaskIds.clear();
			this.render();
		});

		const deleteSelectedBtn = actionsEl.createEl('button', {
			cls: 'aulyckanban-archive-selection-btn aulyckanban-archive-delete-selected-btn',
			text: t('archive.delete.selected'),
			attr: { type: 'button' },
		});
		deleteSelectedBtn.disabled = selectedCount === 0;
		deleteSelectedBtn.addEventListener('click', () => {
			this.confirmDeleteSelected(Array.from(this.selectedTaskIds));
		});

		const moreBtn = actionsEl.createEl('button', {
			cls: 'aulyckanban-archive-more-btn',
			attr: { type: 'button' },
		});
		setIcon(moreBtn, 'more-horizontal');
		appendAccessibleLabel(moreBtn, t('archive.delete.more'));
		moreBtn.disabled = filteredIds.length === 0;
		moreBtn.addEventListener('click', () => this.showFilteredDeleteMenu(moreBtn, filteredIds));
	}

	private confirmDeleteSelected(ids: string[]): void {
		if (ids.length === 0) return;
		new ConfirmModal(this.app, {
			message: t('archive.confirm.deleteSelected').replace('{count}', String(ids.length)),
			isDestructive: true,
			onConfirm: () => {
				this.selectedTaskIds.clear();
				this.store.dispatch({ type: 'DELETE_ARCHIVE_TASKS', payload: { taskIds: ids } });
			},
		}).open();
	}

	private showFilteredDeleteMenu(anchorEl: HTMLElement, filteredIds: string[]): void {
		if (filteredIds.length === 0) return;
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle(t('archive.delete.filtered').replace('{count}', String(filteredIds.length)))
				.setIcon('trash')
				.onClick(() => {
					new ConfirmModal(this.app, {
						message: t('archive.confirm.deleteFiltered').replace('{count}', String(filteredIds.length)),
						isDestructive: true,
						onConfirm: () => {
							this.selectedTaskIds.clear();
							this.store.dispatch({
								type: 'DELETE_ARCHIVE_TASKS',
								payload: { taskIds: filteredIds },
							});
						},
					}).open();
				});
		});
		const rect = anchorEl.getBoundingClientRect();
		menu.showAtPosition({ x: rect.right, y: rect.bottom });
	}

	private applySearch(value: string): void {
		this.searchKeyword = value.trim();
		this.render();
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
		const activeColumnId = this.store.getActiveColumnId();
		const filtered = items.filter(({ task }) => {
			if (this.store.getArchiveColumnId(task) !== activeColumnId) return false;
			if (keyword && !task.content.toLowerCase().includes(keyword)) return false;
			return true;
		});

		filtered.sort((a, b) => {
			const aTime = getArchivedAtTime(a.task);
			const bTime = getArchivedAtTime(b.task);
			return this.sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
		});

		return filtered;
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
		const isSelected = this.selectedTaskIds.has(task.id);
		const cardEl = parentEl.createDiv({
			cls: [
				'aulyckanban-task',
				'aulyckanban-archive-task',
				this.deleteMode ? 'aulyckanban-archive-task-selecting' : '',
				isSelected ? 'aulyckanban-archive-task-selected' : '',
			].filter(Boolean).join(' '),
		});
		if (this.deleteMode) {
			cardEl.setAttribute('role', 'checkbox');
			cardEl.setAttribute('aria-checked', String(isSelected));
			cardEl.addEventListener('click', (event: MouseEvent) => {
				const target = event.target;
				if (target instanceof Element && target.closest('input, button')) return;
				this.toggleTaskSelection(task.id);
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
			checkbox.addEventListener('change', () => this.toggleTaskSelection(task.id));
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
					// RESTORE_TASK 会在全部任务类型的归档中定位任务并还原到原视图，无需先切换视图
					onConfirm: () => this.store.dispatch({
						type: 'RESTORE_TASK',
						payload: { taskId: task.id },
					}),
				}).open();
			});
		}

		const metaEl = cardEl.createDiv({ cls: 'aulyckanban-archive-task-meta' });
		metaEl.createSpan({
			cls: 'aulyckanban-archive-meta-item',
			text: boardData.views.find((view) => view.id === viewKind)?.title ?? viewKind,
		});
		metaEl.createSpan({ cls: 'aulyckanban-archive-meta-separator', text: '·' });
		metaEl.createSpan({
			cls: 'aulyckanban-archive-meta-item',
			text: this.resolveTaskCategory(task, viewKind, boardData),
		});
		metaEl.createSpan({ cls: 'aulyckanban-archive-meta-separator', text: '·' });
		metaEl.createSpan({
			cls: 'aulyckanban-task-time aulyckanban-archive-task-time',
			text: `${t('archive.archivedAt')} ${formatDateTimeMinute(getArchivedAtIso(task))}`,
		});
	}

	private toggleTaskSelection(taskId: string): void {
		if (this.selectedTaskIds.has(taskId)) this.selectedTaskIds.delete(taskId);
		else this.selectedTaskIds.add(taskId);
		this.render();
	}
}
