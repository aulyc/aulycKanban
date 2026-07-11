import { Notice } from 'obsidian';
import type { BoardData } from '../types';
import type { KanbanStore } from '../store';
import { t } from '../i18n';
import { isMigratableBoardData, migrateBoardData } from './boardMigration';
import { BACKUP_VERSION } from '../constants';

/**
 * 备份导出/导入服务
 */
export class BackupService {
	private readonly store: KanbanStore;

	constructor(store: KanbanStore) {
		this.store = store;
	}

	/**
	 * 导出备份（JSON 文件下载）
	 */
	async exportBackup(): Promise<void> {
		try {
			const boardData = this.store.getBoardData();
			const dataToBackup = {
				work: boardData.work,
				personal: boardData.personal,
				workArchive: boardData.workArchive ?? { tasks: [] },
				personalArchive: boardData.personalArchive ?? { tasks: [] },
				backupTime: new Date().toISOString(),
				version: BACKUP_VERSION,
			};

			const jsonStr = JSON.stringify(dataToBackup, null, 2);
			const blob = new Blob([jsonStr], { type: 'application/json' });
			const url = URL.createObjectURL(blob);

			const timestamp = new Date()
				.toISOString()
				.replace(/[:.]/g, '-')
				.slice(0, -5);
			const filename = `aulyckanban-backup-${timestamp}.json`;

			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();

			URL.revokeObjectURL(url);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			new Notice(`${t('settings.backup.fail')}：${msg}`);
		}
	}

	/**
	 * 导入备份（JSON 文件上传 + 解析 + 校验）
	 */
	async importBackup(): Promise<void> {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';

		input.addEventListener('change', async (e: Event) => {
			const target = e.target as HTMLInputElement;
			const file = target.files?.[0];
			if (!file) return;

			try {
				const text = await file.text();
				const importedData = JSON.parse(text) as Record<string, unknown>;

				// 校验格式
				const validBoard = this.validateAndMigrate(importedData);
				if (!validBoard) {
					new Notice(t('settings.import.invalidFormat'));
					return;
				}

				// 更新 store
				this.store.dispatch({
					type: 'SET_BOARD_DATA',
					payload: { board: validBoard },
				});

				// 立即保存
				await this.store.saveNow();

				new Notice(t('settings.import.success'));
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				new Notice(`${t('settings.import.fail')}：${msg}`);
			}
		});

		input.click();
	}

	/**
	 * 校验并迁移导入数据
	 * 支持新格式（双视图）和旧格式（单 columns 数组）
	 */
	private validateAndMigrate(data: Record<string, unknown>): BoardData | null {
		if (!isMigratableBoardData(data)) return null;
		return migrateBoardData(data);
	}
}
