import type { Task, Column } from '../types';
import type { KanbanStore } from '../store';
import { t } from '../i18n';
import { formatDateTimeMinute } from '../utils/datetime';
import { ARCHIVE_UNCATEGORIZED_ID } from '../constants';

/**
 * 归档视图组件
 * 合并展示工作+个人归档，按大类分隔，各自按分类分组
 */
export class ArchiveView {
	private containerEl: HTMLElement;
	private store: KanbanStore;

	constructor(containerEl: HTMLElement, store: KanbanStore) {
		this.containerEl = containerEl;
		this.store = store;
	}

	render(): void {
		this.containerEl.empty();

		const boardData = this.store.getBoardData();
		const workArchive = boardData.workArchive?.tasks ?? [];
		const personalArchive = boardData.personalArchive?.tasks ?? [];

		if (workArchive.length === 0 && personalArchive.length === 0) {
			const emptyEl = this.containerEl.createDiv({ cls: 'xaulyc-archive-empty' });
			emptyEl.setText(t('archive.empty'));
			return;
		}

		const listEl = this.containerEl.createDiv({ cls: 'xaulyc-archive-list' });

		// 工作任务归档
		if (workArchive.length > 0) {
			this.renderViewSection(
				listEl,
				t('view.work'),
				workArchive,
				boardData.work.columns,
				'work',
			);
		}

		// 个人任务归档
		if (personalArchive.length > 0) {
			this.renderViewSection(
				listEl,
				t('view.personal'),
				personalArchive,
				boardData.personal.columns,
				'personal',
			);
		}
	}

	/**
	 * 渲染一个视图（工作/个人）的归档区块
	 */
	private renderViewSection(
		parentEl: HTMLElement,
		viewTitle: string,
		tasks: Task[],
		columns: Column[],
		viewKind: 'work' | 'personal',
	): void {
		// 大类标题
		const viewSectionEl = parentEl.createDiv({ cls: 'xaulyc-archive-view-section' });
		const viewHeaderEl = viewSectionEl.createDiv({ cls: 'xaulyc-archive-view-header' });
		viewHeaderEl.createSpan({ text: viewTitle, cls: 'xaulyc-archive-view-title' });
		viewHeaderEl.createSpan({ text: String(tasks.length), cls: 'xaulyc-archive-view-count' });

		// 按分类分组
		const grouped = this.groupByColumn(tasks, columns);

		for (const column of columns) {
			const colTasks = grouped.get(column.id) ?? [];
			if (colTasks.length === 0) continue;

			const sectionEl = viewSectionEl.createDiv({ cls: 'xaulyc-archive-section' });
			const headerEl = sectionEl.createDiv({ cls: 'xaulyc-task-list-header' });
			headerEl.createSpan({ text: column.title, cls: 'xaulyc-task-list-title' });
			headerEl.createSpan({ text: String(colTasks.length), cls: 'xaulyc-task-list-count' });

			const sorted = [...colTasks].sort((a, b) => {
				const aTime = new Date(a.archivedAt ?? a.completedAt ?? a.createdAt).getTime();
				const bTime = new Date(b.archivedAt ?? b.completedAt ?? b.createdAt).getTime();
				return bTime - aTime;
			});

			for (const task of sorted) {
				this.renderArchiveCard(sectionEl, task, viewKind);
			}
		}

		// 未分类
		const uncategorized = grouped.get(ARCHIVE_UNCATEGORIZED_ID) ?? [];
		if (uncategorized.length > 0) {
			const sectionEl = viewSectionEl.createDiv({ cls: 'xaulyc-archive-section' });
			const headerEl = sectionEl.createDiv({ cls: 'xaulyc-task-list-header' });
			headerEl.createSpan({ text: t('archive.other'), cls: 'xaulyc-task-list-title' });
			headerEl.createSpan({ text: String(uncategorized.length), cls: 'xaulyc-task-list-count' });

			for (const task of uncategorized) {
				this.renderArchiveCard(sectionEl, task, viewKind);
			}
		}
	}

	private renderArchiveCard(parentEl: HTMLElement, task: Task, viewKind: 'work' | 'personal'): void {
		const cardEl = parentEl.createDiv({ cls: 'xaulyc-task xaulyc-archive-task' });

		const middleEl = cardEl.createDiv({ cls: 'xaulyc-task-middle' });

		const contentEl = middleEl.createDiv({ cls: 'xaulyc-task-content xaulyc-task-content-completed' });
		this.setTextWithLineBreaks(contentEl, task.content);

		const timeEl = middleEl.createDiv({ cls: 'xaulyc-task-time' });
		const archiveTime = task.archivedAt ?? task.completedAt ?? task.createdAt;
		timeEl.setText(`${t('archive.archivedAt')} ${this.formatTime(archiveTime)}`);

		const restoreBtn = cardEl.createEl('button', {
			text: t('archive.restore'),
			cls: 'xaulyc-archive-restore-btn',
		});
		restoreBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
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
	}

	private groupByColumn(tasks: Task[], columns: Column[]): Map<string, Task[]> {
		const map = new Map<string, Task[]>();
		for (const col of columns) {
			map.set(col.id, []);
		}
		map.set(ARCHIVE_UNCATEGORIZED_ID, []);

		for (const task of tasks) {
			const colId = task.sourceColumnId ?? ARCHIVE_UNCATEGORIZED_ID;
			const list = map.get(colId);
			if (list) {
				list.push(task);
			} else {
				map.get(ARCHIVE_UNCATEGORIZED_ID)?.push(task);
			}
		}
		return map;
	}

	private formatTime(isoStr: string): string {
		return formatDateTimeMinute(isoStr);
	}

	private setTextWithLineBreaks(el: HTMLElement, text: string): void {
		const lines = text.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line !== undefined) {
				el.appendText(line);
			}
			if (i < lines.length - 1) {
				el.createEl('br');
			}
		}
	}
}
