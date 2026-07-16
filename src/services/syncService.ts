import { Notice, normalizePath, TFile, Vault } from 'obsidian';
import type { KanbanStore } from '../store';
import type { ArchiveData, Task, TaskView, ViewKind } from '../types';
import { t } from '../i18n';
import { generateAggregateMarkdown, generateMarkdown } from '../utils/markdown';
import { formatDateTime, formatDateTimeMinute } from '../utils/datetime';
import { getArchivedAtIso, getArchivedAtTime } from '../utils/task';
import { ARCHIVE_UNCATEGORIZED_ID, PERFORMANCE } from '../constants';

const SYNC_START = '<!-- XAULYC_KANBAN:START -->';
const SYNC_END = '<!-- XAULYC_KANBAN:END -->';

export class VaultSyncService {
	private syncTimeout: ReturnType<typeof setTimeout> | null = null;
	private pendingAllViews = false;
	private pendingArchive = false;
	private readonly pendingViewIds = new Set<ViewKind>();

	constructor(
		private readonly vault: Vault,
		private readonly store: KanbanStore,
	) {}

	scheduleSyncCurrentView(): void {
		this.scheduleSyncView(this.store.getCurrentView());
	}
	scheduleSyncView(viewId: ViewKind): void {
		this.pendingViewIds.add(viewId);
		this.pendingArchive = true;
		this.scheduleSync();
	}
	scheduleSyncAllViews(): void {
		this.pendingAllViews = true;
		this.pendingArchive = true;
		this.scheduleSync();
	}
	scheduleSyncArchive(): void {
		this.pendingArchive = true;
		this.scheduleSync();
	}

	private scheduleSync(): void {
		if (this.syncTimeout) clearTimeout(this.syncTimeout);
		this.syncTimeout = setTimeout(() => {
			const syncAll = this.pendingAllViews;
			const syncArchive = this.pendingArchive;
			const viewIds = [...this.pendingViewIds];
			this.pendingAllViews = false;
			this.pendingArchive = false;
			this.pendingViewIds.clear();
			if (this.isAggregateMode()) {
				void this.syncAggregate(true);
			} else {
				if (syncAll) void this.syncAllViews(true);
				else void this.syncViews(viewIds, true);
				if (syncArchive) void this.syncArchive(true);
			}
			this.syncTimeout = null;
		}, this.store.getSettings().syncDebounce ?? PERFORMANCE.SYNC_DEBOUNCE);
	}

	async syncCurrentView(silent = false): Promise<void> {
		if (this.isAggregateMode()) {
			await this.syncAggregate(silent);
			return;
		}
		await this.syncView(this.store.getCurrentView(), silent);
	}

	async syncConfiguredTargets(silent = false): Promise<void> {
		if (this.isAggregateMode()) {
			await this.syncAggregate(silent);
			return;
		}
		await Promise.all([this.syncAllViews(silent), this.syncArchive(silent)]);
	}

	private async syncAllViews(silent: boolean): Promise<void> {
		await Promise.all(this.store.getTaskViews().map((view) => this.syncView(view.id, silent)));
	}

	private async syncViews(viewIds: readonly ViewKind[], silent: boolean): Promise<void> {
		await Promise.all(viewIds.map((viewId) => this.syncView(viewId, silent)));
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
			await this.writeToFile(
				normalizePath(target.filePath),
				generateMarkdown([...view.columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))),
				silent,
			);
		} catch (error) {
			if (!silent)
				new Notice(`${t('sync.fail')}：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async syncAggregate(silent: boolean): Promise<void> {
		const path = this.store.getSettings().aggregate?.filePath;
		if (!path) {
			if (!silent) new Notice(t('sync.noTarget'));
			return;
		}
		const views = this.store.getTaskViews();
		const archives: Record<ViewKind, ArchiveData> = Object.fromEntries(
			views.map((view) => [view.id, { tasks: this.store.getArchive(view.id) }]),
		);
		try {
			await this.writeToFile(
				normalizePath(path),
				generateAggregateMarkdown(views, archives),
				silent,
			);
		} catch (error) {
			if (!silent)
				new Notice(`${t('sync.fail')}：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async syncArchive(silent = false): Promise<void> {
		const path = this.store.getSettings().archive?.filePath;
		if (!path) return;
		try {
			await this.writeToFile(normalizePath(path), this.generateArchiveMarkdown(), silent);
		} catch (error) {
			if (!silent)
				new Notice(`${t('sync.fail')}：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private generateArchiveMarkdown(): string {
		const views = this.store.getTaskViews();
		const total = views.reduce((count, view) => count + this.store.getArchive(view.id).length, 0);
		let markdown = `> ${t('md.syncTime')}：${formatDateTime(new Date())}\n\n`;
		markdown += `## ${t('md.archiveStats')}\n\n- ${t('md.archiveTotal')}：${total}\n`;
		for (const view of views)
			markdown += `- ${view.title}：${this.store.getArchive(view.id).length}\n`;
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
			const sourceColumnId = task.sourceColumnId;
			const key =
				sourceColumnId && grouped.has(sourceColumnId) ? sourceColumnId : ARCHIVE_UNCATEGORIZED_ID;
			grouped.get(key)?.push(task);
		}
		let markdown = '';
		const render = (title: string, columnTasks: Task[]): void => {
			if (columnTasks.length === 0) return;
			markdown += `### ${title}\n\n`;
			for (const task of [...columnTasks].sort(
				(a, b) => getArchivedAtTime(b) - getArchivedAtTime(a),
			)) {
				const time = formatDateTimeMinute(getArchivedAtIso(task));
				markdown += `- [x] ${task.content}  *(${t('archive.archivedAt')} ${time})*\n`;
			}
			markdown += '\n';
		};
		for (const column of view.columns) render(column.title, grouped.get(column.id) ?? []);
		render(t('archive.other'), grouped.get(ARCHIVE_UNCATEGORIZED_ID) ?? []);
		return markdown;
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
		if (directory && !this.vault.getAbstractFileByPath(directory))
			await this.vault.createFolder(directory);
		await this.vault.create(filePath, wrapped);
		if (!silent) new Notice(t('sync.exported'));
	}

	flush(): void {
		const pending = this.syncTimeout !== null;
		const allViews = this.pendingAllViews;
		const archive = this.pendingArchive;
		const viewIds = [...this.pendingViewIds];
		if (this.syncTimeout) clearTimeout(this.syncTimeout);
		this.syncTimeout = null;
		this.pendingAllViews = false;
		this.pendingArchive = false;
		this.pendingViewIds.clear();
		if (!pending) return;
		if (this.isAggregateMode()) {
			void this.syncAggregate(true);
		} else {
			if (allViews) void this.syncAllViews(true);
			else void this.syncViews(viewIds, true);
			if (archive) void this.syncArchive(true);
		}
	}

	private isAggregateMode(): boolean {
		return this.store.getSettings().syncMode !== 'per-view';
	}
}
