import type { Task, ColumnId } from '../types';
import type { KanbanStore } from '../store';
import { COLUMN_DEFINITIONS } from '../constants';
import { t } from '../i18n';

/**
 * 归档视图组件
 * 按五列分类展示已归档任务，显示归档时间，可恢复
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

		const archiveTasks = this.store.getCurrentArchive();

		if (archiveTasks.length === 0) {
			const emptyEl = this.containerEl.createDiv({ cls: 'xaulyc-archive-empty' });
			emptyEl.setText(t('archive.empty'));
			return;
		}

		// 按列分组
		const grouped = this.groupByColumn(archiveTasks);

		const columnsEl = this.containerEl.createDiv({ cls: 'xaulyc-columns' });

		for (const colDef of COLUMN_DEFINITIONS) {
			const tasks = grouped.get(colDef.id) ?? [];

			const colEl = columnsEl.createDiv({ cls: 'xaulyc-column xaulyc-archive-column' });

			// 列标题
			const headerEl = colEl.createDiv({ cls: 'xaulyc-column-header' });
			const leftEl = headerEl.createDiv({ cls: 'xaulyc-column-header-left' });
			leftEl.createEl('span', { text: colDef.title, cls: 'xaulyc-column-title' });
			leftEl.createEl('span', { text: String(tasks.length), cls: 'xaulyc-column-count' });

			// 任务列表
			const tasksEl = colEl.createDiv({ cls: 'xaulyc-tasks' });

			if (tasks.length === 0) {
				tasksEl.createDiv({ text: t('archive.empty'), cls: 'xaulyc-archive-empty-col' });
				continue;
			}

			// 按归档时间倒序
			const sorted = [...tasks].sort((a, b) => {
				const aTime = new Date(a.archivedAt ?? a.completedAt ?? a.createdAt).getTime();
				const bTime = new Date(b.archivedAt ?? b.completedAt ?? b.createdAt).getTime();
				return bTime - aTime;
			});

			for (const task of sorted) {
				this.renderArchiveCard(tasksEl, task);
			}
		}
	}

	private renderArchiveCard(parentEl: HTMLElement, task: Task): void {
		const cardEl = parentEl.createDiv({ cls: 'xaulyc-task xaulyc-archive-task' });

		// 内容
		const middleEl = cardEl.createDiv({ cls: 'xaulyc-task-middle' });

		const contentEl = middleEl.createDiv({ cls: 'xaulyc-task-content xaulyc-task-content-completed' });
		this.setTextWithLineBreaks(contentEl, task.content);

		// 归档时间
		const timeEl = middleEl.createDiv({ cls: 'xaulyc-task-time' });
		const archiveTime = task.archivedAt ?? task.completedAt ?? task.createdAt;
		timeEl.setText(`${t('archive.archivedAt')} ${this.formatTime(archiveTime)}`);

		// 恢复按钮
		const restoreBtn = cardEl.createEl('button', {
			text: t('archive.restore'),
			cls: 'xaulyc-archive-restore-btn',
		});
		restoreBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			this.store.dispatch({
				type: 'RESTORE_TASK',
				payload: { taskId: task.id },
			});
		});
	}

	private groupByColumn(tasks: Task[]): Map<ColumnId, Task[]> {
		const map = new Map<ColumnId, Task[]>();
		for (const colDef of COLUMN_DEFINITIONS) {
			map.set(colDef.id, []);
		}
		for (const task of tasks) {
			const colId = task.sourceColumnId ?? 'periodic';
			const list = map.get(colId);
			if (list) {
				list.push(task);
			}
		}
		return map;
	}

	private formatTime(isoStr: string): string {
		try {
			const date = new Date(isoStr);
			return date.toLocaleDateString('zh-CN', {
				month: '2-digit',
				day: '2-digit',
			}) + ' ' + date.toLocaleTimeString('zh-CN', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
			});
		} catch {
			return '';
		}
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
