import { Notice } from 'obsidian';
import type { KanbanStore } from '../store';
import { t } from '../i18n';
import { BACKUP_VERSION } from '../constants';
import { parseBackupData, type BackupParseResult } from './backupFormat';

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
	exportBackup(hostEl: HTMLElement): void {
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

			const a = hostEl.createEl('a');
			a.detach();
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
	importBackup(hostEl: HTMLElement): void {
		const input = hostEl.createEl('input');
		input.detach();
		input.type = 'file';
		input.accept = '.json';

		input.addEventListener('change', () => {
			void this.importSelectedFile(input);
		});

		input.click();
	}

	private async importSelectedFile(input: HTMLInputElement): Promise<void> {
		const file = input.files?.[0];
		if (!file) return;

		try {
			const text = await file.text();
			const importedData: unknown = JSON.parse(text);
			const parsed = parseBackupData(importedData);
			if (!parsed.ok) {
				this.reportInvalidBackup(parsed);
				return;
			}

			this.store.dispatch({
				type: 'SET_BOARD_DATA',
				payload: { board: parsed.board },
			});

			await this.store.saveNow();

			new Notice(
				parsed.sourceVersion === '2.0'
					? t('settings.import.successMigrated').replace('{version}', parsed.sourceVersion)
					: t('settings.import.success'),
			);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			new Notice(`${t('settings.import.fail')}：${msg}`);
		}
	}

	private reportInvalidBackup(result: Extract<BackupParseResult, { ok: false }>): void {
		if (result.reason === 'duplicate-id' && result.duplicate) {
			new Notice(
				`${t('settings.import.duplicateId')}：${result.duplicate.field}=${result.duplicate.id}`,
			);
			return;
		}
		if (result.reason === 'newer-version') {
			new Notice(
				t('settings.import.newerVersion').replace('{version}', String(result.declaredVersion)),
			);
			return;
		}
		if (result.reason === 'unsupported-version') {
			new Notice(
				t('settings.import.unsupportedVersion').replace(
					'{version}',
					String(result.declaredVersion),
				),
			);
			return;
		}
		if (result.reason === 'version-mismatch') {
			new Notice(t('settings.import.versionMismatch'));
			return;
		}
		new Notice(t('settings.import.invalidFormat'));
	}
}
