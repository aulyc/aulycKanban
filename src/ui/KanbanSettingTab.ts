import { App, Notice, normalizePath, PluginSettingTab, Setting } from 'obsidian';
import { t } from '../i18n';
import type KanbanPlugin from '../main';
import { BackupService } from '../services/backupService';
import { ClearDataModal } from './ClearDataModal';
import { ConfirmModal } from './ConfirmModal';
import { FileSuggest } from './FileSuggest';

/**
 * 看板设置页（PluginSettingTab）
 * 包含两个区块：数据管理 / 笔记同步
 */
export class KanbanSettingTab extends PluginSettingTab {
	private readonly plugin: KanbanPlugin;
	private readonly backupService: BackupService;
	private readonly fileSuggests: FileSuggest[] = [];

	constructor(app: App, plugin: KanbanPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.backupService = new BackupService(plugin.store);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		for (const suggest of this.fileSuggests) {
			suggest.close();
		}
		this.fileSuggests.length = 0;

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

		this.buildSyncPathSetting(containerEl, {
			nameKey: 'settings.sync.workPath.name',
			descKey: 'settings.sync.workPath.desc',
			placeholderKey: 'settings.sync.workPath.placeholder',
			currentPath: settings.work.filePath,
			otherPaths: [settings.personal.filePath, settings.archive?.filePath ?? ''],
			payload: (filePath) => ({ work: { filePath } }),
		});

		this.buildSyncPathSetting(containerEl, {
			nameKey: 'settings.sync.personalPath.name',
			descKey: 'settings.sync.personalPath.desc',
			placeholderKey: 'settings.sync.personalPath.placeholder',
			currentPath: settings.personal.filePath,
			otherPaths: [settings.work.filePath, settings.archive?.filePath ?? ''],
			payload: (filePath) => ({ personal: { filePath } }),
		});

		this.buildSyncPathSetting(containerEl, {
			nameKey: 'settings.sync.archivePath.name',
			descKey: 'settings.sync.archivePath.desc',
			placeholderKey: 'settings.sync.archivePath.placeholder',
			currentPath: settings.archive?.filePath ?? '',
			otherPaths: [settings.work.filePath, settings.personal.filePath],
			payload: (filePath) => ({ archive: { filePath } }),
		});

		const hintEl = containerEl.createDiv({ cls: 'setting-item-description' });
		hintEl.style.marginTop = '8px';
		hintEl.style.paddingLeft = '16px';
		hintEl.setText(`💡 ${t('settings.sync.hint')}`);
	}

	private buildSyncPathSetting(
		containerEl: HTMLElement,
		opts: {
			nameKey: string;
			descKey: string;
			placeholderKey: string;
			currentPath: string;
			otherPaths: string[];
			payload: (filePath: string) => Partial<import('../types').PluginSettings>;
		},
	): void {
		new Setting(containerEl)
			.setName(t(opts.nameKey))
			.setDesc(t(opts.descKey))
			.addText((text) => {
				text
					.setPlaceholder(t(opts.placeholderKey))
					.setValue(opts.currentPath)
					.onChange(async (value) => {
						const normalized = value.trim() ? normalizePath(value.trim()) : '';
						const isDuplicate = normalized && opts.otherPaths.some(
							(p) => p && normalized === normalizePath(p),
						);
						if (isDuplicate) {
							new Notice(t('settings.sync.duplicateError'));
							return;
						}
						this.plugin.store.dispatch({
							type: 'UPDATE_SETTINGS',
							payload: opts.payload(normalized),
						});
						await this.plugin.store.saveNow();
					});
				this.attachFileSuggest(text.inputEl);
			});
	}

	private attachFileSuggest(inputEl: HTMLInputElement): void {
		const suggest = new FileSuggest(this.app, inputEl);
		this.fileSuggests.push(suggest);
	}

	private async clearAllDataAndSave(): Promise<void> {
		this.plugin.store.dispatch({ type: 'CLEAR_ALL_DATA' });
		await this.plugin.store.saveNow();
		new Notice(t('settings.clear.success'));
	}
}
