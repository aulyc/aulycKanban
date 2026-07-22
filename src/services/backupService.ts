import { Notice } from 'obsidian';
import type { BoardData } from '../types';
import type { KanbanStore } from '../store';
import { t } from '../i18n';
import { findImportedBoardDuplicateId, migrateImportedBoardData } from './boardMigration';
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
				views: boardData.views,
				archives: boardData.archives,
				backupTime: new Date().toISOString(),
				version: BACKUP_VERSION,
			};

			const jsonStr = JSON.stringify(dataToBackup, null, 2);
			const blob = new Blob([jsonStr], { type: 'application/json' });
			const url = URL.createObjectURL(blob);

			const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
			const filename = `aulycKanban-backup-${timestamp}.json`;

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
				const importedData: unknown = JSON.parse(text);
				const duplicate = findImportedBoardDuplicateId(importedData);
				if (duplicate) {
					new Notice(`${t('settings.import.duplicateId')}：${duplicate.field}=${duplicate.id}`);
					return;
				}

				// 整份备份先完成深层校验，避免部分坏数据覆盖当前看板。
				const validBoard = this.validateAndMigrate(importedData);
				if (!validBoard) {
					new Notice(t('settings.import.invalidFormat'));
					return;
				}

				this.store.dispatch({
					type: 'SET_BOARD_DATA',
					payload: { board: validBoard },
				});

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
	 * 校验并迁移导入数据；支持动态任务类型格式和旧格式。
	 */
	private validateAndMigrate(data: unknown): BoardData | null {
		return migrateImportedBoardData(data);
	}
}
