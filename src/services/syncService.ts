import { normalizePath, Notice, TFile, Vault } from 'obsidian';
import type { KanbanStore } from '../store';
import type { Task, Column } from '../types';
import { t } from '../i18n';
import { generateMarkdown } from '../utils/markdown';
import { formatDateTime, formatDateTimeMinute } from '../utils/datetime';
import { PERFORMANCE, ARCHIVE_UNCATEGORIZED_ID } from '../constants';

/** 同步区块标记 */
const SYNC_START = '<!-- XAULYC_KANBAN:START -->';
const SYNC_END = '<!-- XAULYC_KANBAN:END -->';

/**
 * Vault 笔记同步服务
 * 将看板数据和归档数据同步到 Obsidian 笔记文件
 */
export class VaultSyncService {
	private readonly vault: Vault;
	private readonly store: KanbanStore;
	private syncTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor(vault: Vault, store: KanbanStore) {
		this.vault = vault;
		this.store = store;
	}

	/**
	 * 计划一次同步（去抖）- 看板 + 归档
	 */
	scheduleSyncCurrentView(): void {
		if (this.syncTimeout) {
			clearTimeout(this.syncTimeout);
		}
		const debounce = this.store.getSettings().syncDebounce ?? PERFORMANCE.SYNC_DEBOUNCE;
		this.syncTimeout = setTimeout(() => {
			void this.syncCurrentView(true);
			void this.syncArchive(true);
			this.syncTimeout = null;
		}, debounce);
	}

	/**
	 * 同步当前视图到笔记
	 */
	async syncCurrentView(silent = false): Promise<void> {
		const settings = this.store.getSettings();
		const currentView = settings.currentView;
		const syncTarget = settings[currentView];

		if (!syncTarget.filePath) {
			if (!silent) {
				new Notice(t('sync.noTarget'));
			}
			return;
		}

		const columns = this.store.getCurrentColumns();
		const markdown = generateMarkdown(columns);
		const filePath = normalizePath(syncTarget.filePath);

		try {
			await this.writeToFile(filePath, markdown, silent);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			if (!silent) {
				new Notice(`${t('sync.fail')}：${msg}`);
			}
		}
	}

	/**
	 * 同步归档到笔记
	 */
	async syncArchive(silent = false): Promise<void> {
		const settings = this.store.getSettings();

		if (!settings.archive?.filePath) return;

		const filePath = normalizePath(settings.archive.filePath);
		const boardData = this.store.getBoardData();

		// 合并工作 + 个人归档
		const workArchive = boardData.workArchive?.tasks ?? [];
		const personalArchive = boardData.personalArchive?.tasks ?? [];

		const markdown = this.generateArchiveMarkdown(workArchive, personalArchive);

		try {
			await this.writeToFile(filePath, markdown, silent);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			if (!silent) {
				new Notice(`${t('sync.fail')}：${msg}`);
			}
		}
	}

	/**
	 * 生成归档 Markdown
	 * 按当前分类展示，工作和个人分别展示，含归档时间
	 */
	private generateArchiveMarkdown(workTasks: Task[], personalTasks: Task[]): string {
		const now = formatDateTime(new Date());

		let md = `> ${t('md.syncTime')}：${now}\n\n`;

		const totalCount = workTasks.length + personalTasks.length;
		md += `## ${t('md.archiveStats')}\n\n`;
		md += `- ${t('md.archiveTotal')}：${totalCount}\n`;
		md += `- ${t('md.archiveWork')}：${workTasks.length}\n`;
		md += `- ${t('md.archivePersonal')}：${personalTasks.length}\n\n`;

		const boardData = this.store.getBoardData();

		if (workTasks.length > 0) {
			md += `## ${t('md.archiveWorkHeading')}\n\n`;
			md += this.renderArchiveByColumn(workTasks, boardData.work.columns);
		}

		if (personalTasks.length > 0) {
			md += `## ${t('md.archivePersonalHeading')}\n\n`;
			md += this.renderArchiveByColumn(personalTasks, boardData.personal.columns);
		}

		return md;
	}

	/**
	 * 按分类渲染归档任务
	 */
	private renderArchiveByColumn(tasks: Task[], columns: Column[]): string {
		let md = '';

		const grouped = new Map<string, Task[]>();
		for (const col of columns) {
			grouped.set(col.id, []);
		}
		grouped.set(ARCHIVE_UNCATEGORIZED_ID, []);

		for (const task of tasks) {
			const colId = task.sourceColumnId ?? ARCHIVE_UNCATEGORIZED_ID;
			const list = grouped.get(colId);
			if (list) {
				list.push(task);
			} else {
				grouped.get(ARCHIVE_UNCATEGORIZED_ID)?.push(task);
			}
		}

		for (const col of columns) {
			const colTasks = grouped.get(col.id) ?? [];
			if (colTasks.length === 0) continue;

			md += `### ${col.title}\n\n`;

			const sorted = [...colTasks].sort((a, b) => {
				const aTime = new Date(a.archivedAt ?? a.createdAt).getTime();
				const bTime = new Date(b.archivedAt ?? b.createdAt).getTime();
				return bTime - aTime;
			});

			for (const task of sorted) {
				const archiveTime = formatDateTimeMinute(task.archivedAt ?? task.completedAt ?? task.createdAt);
				md += `- [x] ${task.content}  *(${t('archive.archivedAt')} ${archiveTime})*\n`;
			}
			md += '\n';
		}

		const otherTasks = grouped.get(ARCHIVE_UNCATEGORIZED_ID) ?? [];
		if (otherTasks.length > 0) {
			md += `### ${t('archive.other')}\n\n`;
			for (const task of otherTasks) {
				const archiveTime = formatDateTimeMinute(task.archivedAt ?? task.completedAt ?? task.createdAt);
				md += `- [x] ${task.content}  *(${t('archive.archivedAt')} ${archiveTime})*\n`;
			}
			md += '\n';
		}

		return md;
	}



	/**
	 * 写入文件
	 */
	private async writeToFile(filePath: string, markdown: string, silent: boolean): Promise<void> {
		const wrappedContent = `${SYNC_START}\n${markdown}\n${SYNC_END}`;

		const existingFile = this.vault.getAbstractFileByPath(filePath);

		if (existingFile instanceof TFile) {
			await this.vault.process(existingFile, (data: string) => {
				const startIdx = data.indexOf(SYNC_START);
				const endIdx = data.indexOf(SYNC_END);

				if (startIdx !== -1 && endIdx !== -1) {
					return data.substring(0, startIdx) + wrappedContent + data.substring(endIdx + SYNC_END.length);
				} else {
					return data + '\n\n' + wrappedContent;
				}
			});

			if (!silent) {
				new Notice(t('sync.updated'));
			}
		} else {
			const dir = filePath.substring(0, filePath.lastIndexOf('/'));
			if (dir) {
				const dirExists = this.vault.getAbstractFileByPath(dir);
				if (!dirExists) {
					await this.vault.createFolder(dir);
				}
			}

			await this.vault.create(filePath, wrappedContent);

			if (!silent) {
				new Notice(t('sync.exported'));
			}
		}
	}

	flush(): void {
		const hadPending = this.syncTimeout !== null;
		if (this.syncTimeout) {
			clearTimeout(this.syncTimeout);
			this.syncTimeout = null;
		}
		if (hadPending) {
			void this.syncCurrentView(true);
			void this.syncArchive(true);
		}
	}
}
