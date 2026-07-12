import { Notice, normalizePath, TFile, Vault } from 'obsidian';
import type { KanbanStore } from '../store';
import type { Task, TaskView, ViewKind } from '../types';
import { t } from '../i18n';
import { generateMarkdown } from '../utils/markdown';
import { formatDateTime, formatDateTimeMinute } from '../utils/datetime';
import { ARCHIVE_UNCATEGORIZED_ID, PERFORMANCE } from '../constants';

const SYNC_START = '<!-- XAULYC_KANBAN:START -->';
const SYNC_END = '<!-- XAULYC_KANBAN:END -->';

export class VaultSyncService {
	private syncTimeout: ReturnType<typeof setTimeout> | null = null;
	private pendingAllViews = false;

	constructor(private readonly vault: Vault, private readonly store: KanbanStore) {}

	scheduleSyncCurrentView(): void { this.scheduleSync(false); }
	scheduleSyncAllViews(): void { this.scheduleSync(true); }

	private scheduleSync(allViews: boolean): void {
		if (allViews) this.pendingAllViews = true;
		if (this.syncTimeout) clearTimeout(this.syncTimeout);
		this.syncTimeout = setTimeout(() => {
			const syncAll = this.pendingAllViews;
			this.pendingAllViews = false;
			if (syncAll) void this.syncAllViews(true);
			else void this.syncCurrentView(true);
			void this.syncArchive(true);
			this.syncTimeout = null;
		}, this.store.getSettings().syncDebounce ?? PERFORMANCE.SYNC_DEBOUNCE);
	}

	async syncCurrentView(silent = false): Promise<void> {
		await this.syncView(this.store.getCurrentView(), silent);
	}

	private async syncAllViews(silent: boolean): Promise<void> {
		await Promise.all(this.store.getTaskViews().map((view) => this.syncView(view.id, silent)));
	}

	private async syncView(viewId: ViewKind, silent: boolean): Promise<void> {
		const target = this.store.getSettings().viewSyncTargets[viewId];
		if (!target?.filePath) {
			if (!silent) new Notice(t('sync.noTarget'));
			return;
		}
		const view = this.store.getView(viewId);
		if (!view) return;
		try {
			await this.writeToFile(normalizePath(target.filePath), generateMarkdown([
				...view.columns,
			].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))), silent);
		} catch (error) {
			if (!silent) new Notice(`${t('sync.fail')}：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async syncArchive(silent = false): Promise<void> {
		const path = this.store.getSettings().archive?.filePath;
		if (!path) return;
		try {
			await this.writeToFile(normalizePath(path), this.generateArchiveMarkdown(), silent);
		} catch (error) {
			if (!silent) new Notice(`${t('sync.fail')}：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private generateArchiveMarkdown(): string {
		const views = this.store.getTaskViews();
		const total = views.reduce((count, view) => count + this.store.getArchive(view.id).length, 0);
		let markdown = `> ${t('md.syncTime')}：${formatDateTime(new Date())}\n\n`;
		markdown += `## ${t('md.archiveStats')}\n\n- ${t('md.archiveTotal')}：${total}\n`;
		for (const view of views) markdown += `- ${view.title}：${this.store.getArchive(view.id).length}\n`;
		markdown += '\n';
		for (const view of views) {
			const tasks = this.store.getArchive(view.id);
			if (tasks.length === 0) continue;
			markdown += `## ${view.title}\n\n${this.renderArchiveByColumn(tasks, view)}`;
		}
		return markdown;
	}

	private renderArchiveByColumn(tasks: Task[], view: TaskView): string {
		const grouped = new Map<string, Task[]>(view.columns.map((column) => [column.id, []]));
		grouped.set(ARCHIVE_UNCATEGORIZED_ID, []);
		for (const task of tasks) {
			const key = grouped.has(task.sourceColumnId ?? '') ? task.sourceColumnId! : ARCHIVE_UNCATEGORIZED_ID;
			grouped.get(key)?.push(task);
		}
		let markdown = '';
		const render = (title: string, columnTasks: Task[]): void => {
			if (columnTasks.length === 0) return;
			markdown += `### ${title}\n\n`;
			for (const task of [...columnTasks].sort((a, b) => this.taskTime(b) - this.taskTime(a))) {
				const time = formatDateTimeMinute(task.archivedAt ?? task.completedAt ?? task.createdAt);
				markdown += `- [x] ${task.content}  *(${t('archive.archivedAt')} ${time})*\n`;
			}
			markdown += '\n';
		};
		for (const column of view.columns) render(column.title, grouped.get(column.id) ?? []);
		render(t('archive.other'), grouped.get(ARCHIVE_UNCATEGORIZED_ID) ?? []);
		return markdown;
	}

	private taskTime(task: Task): number {
		return new Date(task.archivedAt ?? task.completedAt ?? task.createdAt).getTime();
	}

	private async writeToFile(filePath: string, markdown: string, silent: boolean): Promise<void> {
		const wrapped = `${SYNC_START}\n${markdown}\n${SYNC_END}`;
		const existing = this.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			await this.vault.process(existing, (data) => {
				const start = data.indexOf(SYNC_START);
				const end = data.indexOf(SYNC_END);
				return start >= 0 && end >= 0
					? data.substring(0, start) + wrapped + data.substring(end + SYNC_END.length)
					: `${data}\n\n${wrapped}`;
			});
			if (!silent) new Notice(t('sync.updated'));
			return;
		}
		const directory = filePath.substring(0, filePath.lastIndexOf('/'));
		if (directory && !this.vault.getAbstractFileByPath(directory)) await this.vault.createFolder(directory);
		await this.vault.create(filePath, wrapped);
		if (!silent) new Notice(t('sync.exported'));
	}

	flush(): void {
		const pending = this.syncTimeout !== null;
		const allViews = this.pendingAllViews;
		if (this.syncTimeout) clearTimeout(this.syncTimeout);
		this.syncTimeout = null;
		this.pendingAllViews = false;
		if (!pending) return;
		if (allViews) void this.syncAllViews(true);
		else void this.syncCurrentView(true);
		void this.syncArchive(true);
	}
}
