import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { t } from '../i18n';
import type KanbanPlugin from '../main';
import { BackupService } from '../services/backupService';
import { normalizeSyncFolder } from '../utils/noteSync';
import { ClearDataModal } from './ClearDataModal';
import { ConfirmModal } from './ConfirmModal';

/**
 * 看板设置页（PluginSettingTab）
 * 包含两个区块：数据管理 / 笔记同步
 */
export class KanbanSettingTab extends PluginSettingTab {
	private readonly plugin: KanbanPlugin;
	private readonly backupService: BackupService;

	constructor(app: App, plugin: KanbanPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.backupService = new BackupService(plugin.store);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ==================== 数据管理 ====================
		new Setting(containerEl).setHeading().setName(t('settings.dataManagement'));

		new Setting(containerEl)
			.setName(t('settings.backup.name'))
			.setDesc(t('settings.backup.desc'))
			.addButton((btn) =>
				btn.setButtonText(t('settings.backup.button')).onClick(async () => {
					await this.backupService.exportBackup();
				}),
			);

		new Setting(containerEl)
			.setName(t('settings.import.name'))
			.setDesc(t('settings.import.desc'))
			.addButton((btn) =>
				btn.setButtonText(t('settings.import.button')).onClick(() => {
					new ConfirmModal(this.app, {
						message: t('settings.import.confirm'),
						onConfirm: () => {
							void this.backupService.importBackup();
						},
					}).open();
				}),
			);

		new Setting(containerEl)
			.setName(t('settings.clear.name'))
			.setDesc(t('settings.clear.desc'))
			.addButton((btn) =>
				btn
					.setButtonText(t('settings.clear.button'))
					.setWarning()
					.onClick(() => {
						new ClearDataModal(this.app, {
							onBackup: () => {
								void this.backupService.exportBackup();
							},
							onConfirmClear: () => {
								void this.clearAllDataAndSave();
							},
						}).open();
					}),
			);

		// ==================== 笔记同步 ====================
		new Setting(containerEl).setHeading().setName(t('settings.sync'));

		const settings = this.plugin.store.getSettings();
		new Setting(containerEl)
			.setName(t('settings.sync.folder.name'))
			.setDesc(t('settings.sync.folder.desc'))
			.addText((text) => {
				let latestFolder = settings.syncFolder;
				text
					.setPlaceholder(t('settings.sync.folder.placeholder'))
					.setValue(settings.syncFolder)
					.onChange(async (value) => {
						latestFolder = normalizeSyncFolder(value);
						this.plugin.store.dispatch({
							type: 'UPDATE_SETTINGS',
							payload: { syncFolder: latestFolder },
						});
						try {
							await this.plugin.store.saveNow();
						} catch {
							// persistData 已提示用户并安排重试
						}
					});
				text.inputEl.addEventListener('change', () => {
					if (latestFolder) this.plugin.syncService.scheduleSyncAllViews();
				});
			});

		const hintEl = containerEl.createDiv({
			cls: 'setting-item-description aulyckanban-settings-hint',
		});
		hintEl.setText(`💡 ${t('settings.sync.hint')}`);
	}

	private async clearAllDataAndSave(): Promise<void> {
		this.plugin.store.dispatch({ type: 'CLEAR_ALL_DATA' });
		try {
			await this.plugin.store.saveNow();
			new Notice(t('settings.clear.success'));
		} catch {
			// persistData 已提示保存失败并安排重试
		}
	}
}
