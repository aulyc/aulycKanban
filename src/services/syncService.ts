import { normalizePath, Notice, TFile, Vault } from 'obsidian';
import type { KanbanStore } from '../store';
import type { Task, ColumnId } from '../types';
import { t } from '../i18n';
import { generateMarkdown } from '../utils/markdown';
import { PERFORMANCE, COLUMN_DEFINITIONS } from '../constants';

/** 同步区块标记 */
const SYNC_START = '<!-- XAULYC_KANBAN:START -->';
const SYNC_END = '<!-- XAULYC_KANBAN:END -->';

/**
 * Vault 笔记同步服务
 * 将看板数据和归档数据同步到 Obsidian 笔记文件
 */
export class VaultSyncService {
	private vault: Vault;
	private store: KanbanStore;
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
		this.syncTimeout = setTimeout(() => {
			void this.syncCurrentView(true);
			void this.syncArchive(true);
			this.syncTimeout = null;
		}, PERFORMANCE.SYNC_DEBOUNCE);
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
	 * 同步指定视图到笔记
	 */
	async syncView(viewKind: 'work' | 'personal', silent = false): Promise<void> {
		const settings = this.store.getSettings();
		const syncTarget = settings[viewKind];

		if (!syncTarget.filePath) return;

		const boardData = this.store.getBoardData();
		const viewData = boardData[viewKind];
		const markdown = generateMarkdown(viewData.columns);
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
	 * 生成归档 Markdown
	 * 按五列分类，工作和个人分别展示，含归档时间
	 */
	private generateArchiveMarkdown(workTasks: Task[], personalTasks: Task[]): string {
		const now = new Date().toLocaleString('zh-CN', {
			year: 'numeric', month: '2-digit', day: '2-digit',
			hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
		});

		let md = `> ${t('md.syncTime')}：${now}\n\n`;

		const totalCount = workTasks.length + personalTasks.length;
		md += `## 📦 归档统计\n\n`;
		md += `- 总归档数：${totalCount}\n`;
		md += `- 工作任务：${workTasks.length}\n`;
		md += `- 个人任务：${personalTasks.length}\n\n`;

		// 工作归档
		if (workTasks.length > 0) {
			md += `## 💼 工作任务归档\n\n`;
			md += this.renderArchiveByColumn(workTasks);
		}

		// 个人归档
		if (personalTasks.length > 0) {
			md += `## 👤 个人任务归档\n\n`;
			md += this.renderArchiveByColumn(personalTasks);
		}

		return md;
	}

	/**
	 * 按五列分类渲染归档任务
	 */
	private renderArchiveByColumn(tasks: Task[]): string {
		let md = '';

		// 按列分组
		const grouped = new Map<ColumnId, Task[]>();
		for (const colDef of COLUMN_DEFINITIONS) {
			grouped.set(colDef.id, []);
		}
		for (const task of tasks) {
			const colId = task.sourceColumnId ?? 'periodic';
			const list = grouped.get(colId);
			if (list) {
				list.push(task);
			}
		}

		for (const colDef of COLUMN_DEFINITIONS) {
			const colTasks = grouped.get(colDef.id) ?? [];
			if (colTasks.length === 0) continue;

			md += `### ${colDef.title}\n\n`;

			// 按归档时间倒序
			const sorted = [...colTasks].sort((a, b) => {
				const aTime = new Date(a.archivedAt ?? a.createdAt).getTime();
				const bTime = new Date(b.archivedAt ?? b.createdAt).getTime();
				return bTime - aTime;
			});

			for (const task of sorted) {
				const archiveTime = this.formatTime(task.archivedAt ?? task.completedAt ?? task.createdAt);
				md += `- [x] ${task.content}  *(${t('archive.archivedAt')} ${archiveTime})*\n`;
			}
			md += '\n';
		}

		return md;
	}

	private formatTime(isoStr: string): string {
		try {
			const date = new Date(isoStr);
			return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
				+ ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
		} catch {
			return '';
		}
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
		if (this.syncTimeout) {
			clearTimeout(this.syncTimeout);
			this.syncTimeout = null;
		}
	}
}
