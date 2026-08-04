import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type { SettingDefinitionItem, TFolder } from 'obsidian';
import { normalizeUiLanguage, t, type I18nKey } from '../i18n';
import type KanbanPlugin from '../main';
import { BackupService } from '../services/backupService';
import { normalizeSyncFolder } from '../utils/noteSync';
import { AboutModal } from './AboutModal';
import { ClearDataModal } from './ClearDataModal';
import { ConfirmModal } from './ConfirmModal';

export function listVaultFolders(app: App): string[] {
	return app.vault
		.getRoot()
		.children.filter((file): file is TFolder => 'children' in file)
		.map((folder) => folder.path)
		.filter((path) => path.length > 0 && !path.includes('/'))
		.sort((left, right) => left.localeCompare(right));
}

/**
 * 看板设置页（PluginSettingTab）
 * 包含数据管理、笔记同步和关于入口
 */
export class KanbanSettingTab extends PluginSettingTab {
	private readonly plugin: KanbanPlugin;
	private readonly backupService: BackupService;

	constructor(app: App, plugin: KanbanPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.backupService = new BackupService(plugin.store);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: 'group',
				heading: t('settings.interface'),
				items: [
					{
						name: t('settings.language.name'),
						desc: t('settings.language.desc'),
						render: (setting) => this.renderLanguageSetting(setting),
					},
				],
			},
			{
				type: 'group',
				heading: t('settings.dataManagement'),
				items: [
					{
						name: t('settings.backup.name'),
						desc: t('settings.backup.desc'),
						render: (setting) => this.renderBackupSetting(setting),
					},
					{
						name: t('settings.import.name'),
						desc: t('settings.import.desc'),
						render: (setting) => this.renderImportSetting(setting),
					},
					{
						name: t('settings.clear.name'),
						desc: t('settings.clear.desc'),
						render: (setting) => this.renderClearSetting(setting),
					},
				],
			},
			{
				type: 'group',
				heading: t('settings.sync'),
				items: [
					{
						name: t('settings.sync.folder.name'),
						desc: t('settings.sync.folder.desc'),
						render: (setting) => this.renderSyncFolderSetting(setting),
					},
					{
						name: t('settings.sync.force.name'),
						desc: t('settings.sync.force.desc'),
						render: (setting) => this.renderForceSyncSetting(setting),
					},
				],
			},
			{
				name: t('settings.about.name'),
				desc: t('settings.about.desc'),
				render: (setting) => this.renderAboutSetting(setting),
			},
		];
	}

	display(): void {
		this.renderLegacySettings();
	}

	private renderLegacySettings(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setHeading().setName(t('settings.interface'));
		this.renderLanguageSetting(
			this.createLegacySetting('settings.language.name', 'settings.language.desc'),
		);

		new Setting(containerEl).setHeading().setName(t('settings.dataManagement'));
		this.renderBackupSetting(
			this.createLegacySetting('settings.backup.name', 'settings.backup.desc'),
		);
		this.renderImportSetting(
			this.createLegacySetting('settings.import.name', 'settings.import.desc'),
		);
		this.renderClearSetting(this.createLegacySetting('settings.clear.name', 'settings.clear.desc'));

		new Setting(containerEl).setHeading().setName(t('settings.sync'));
		this.renderSyncFolderSetting(
			this.createLegacySetting('settings.sync.folder.name', 'settings.sync.folder.desc'),
		);
		this.renderForceSyncSetting(
			this.createLegacySetting('settings.sync.force.name', 'settings.sync.force.desc'),
		);
		this.renderAboutSetting(this.createLegacySetting('settings.about.name', 'settings.about.desc'));
	}

	private createLegacySetting(nameKey: I18nKey, descKey: I18nKey): Setting {
		return new Setting(this.containerEl).setName(t(nameKey)).setDesc(t(descKey));
	}

	private renderLanguageSetting(setting: Setting): void {
		const selectedLanguage = this.plugin.store.getSettings().uiLanguage;
		setting.addDropdown((dropdown) => {
			dropdown
				.addOption('system', t('settings.language.system'))
				.addOption('zh-CN', t('settings.language.zhCN'))
				.addOption('en', t('settings.language.en'))
				.setValue(selectedLanguage)
				.onChange(async (value) => {
					const uiLanguage = normalizeUiLanguage(value);
					this.plugin.applyUiLanguage(uiLanguage);
					this.plugin.store.dispatch({
						type: 'UPDATE_SETTINGS',
						payload: { uiLanguage },
					});
					try {
						await this.plugin.store.saveNow();
					} catch {
						// persistData 已提示用户并安排重试
					}
					const declarativeTab = this as unknown as { update?: () => void };
					if (typeof declarativeTab.update === 'function') declarativeTab.update();
					else this.renderLegacySettings();
				});
		});
	}

	private renderBackupSetting(setting: Setting): void {
		setting.addButton((btn) => {
			btn.buttonEl.classList.add('aulyckanban-settings-action-button');
			btn.setButtonText(t('settings.backup.button')).onClick(() => {
				this.backupService.exportBackup(btn.buttonEl);
			});
		});
	}

	private renderImportSetting(setting: Setting): void {
		setting.addButton((btn) => {
			btn.buttonEl.classList.add('aulyckanban-settings-action-button');
			btn.setButtonText(t('settings.import.button')).onClick(() => {
				new ConfirmModal(this.app, {
					message: t('settings.import.confirm'),
					onConfirm: () => this.backupService.importBackup(btn.buttonEl),
				}).open();
			});
		});
	}

	private renderClearSetting(setting: Setting): void {
		setting.addButton((btn) => {
			btn.buttonEl.classList.add(
				'aulyckanban-settings-action-button',
				'aulyckanban-settings-danger-button',
			);
			btn.setButtonText(t('settings.clear.button')).onClick(() => {
				new ClearDataModal(this.app, {
					onBackup: () => this.backupService.exportBackup(btn.buttonEl),
					onConfirmClear: () => {
						void this.clearAllDataAndSave();
					},
				}).open();
			});
		});
	}

	private renderSyncFolderSetting(setting: Setting): void {
		const settings = this.plugin.store.getSettings();
		const currentFolder = normalizeSyncFolder(settings.syncFolder);
		const vaultFolders = listVaultFolders(this.app);
		const options = vaultFolders.includes(currentFolder)
			? vaultFolders
			: [currentFolder, ...vaultFolders];

		setting.addDropdown((dropdown) => {
			for (const folder of options) dropdown.addOption(folder, folder);
			dropdown.selectEl.classList.add('aulyckanban-sync-folder-select');
			dropdown.setValue(currentFolder).onChange(async (value) => {
				const selectedFolder = normalizeSyncFolder(value);
				this.plugin.store.dispatch({
					type: 'UPDATE_SETTINGS',
					payload: { syncFolder: selectedFolder },
				});
				try {
					await this.plugin.store.saveNow();
				} catch {
					// persistData 已提示用户并安排重试
				}
				this.plugin.syncService.scheduleSyncAllViews();
			});
		});
	}

	private renderForceSyncSetting(setting: Setting): void {
		setting.addButton((btn) => {
			btn.buttonEl.classList.add('aulyckanban-settings-action-button');
			const idleText = t('settings.sync.force.button');
			const runForceSync = async (): Promise<void> => {
				btn.setDisabled(true).setButtonText(t('settings.sync.force.running'));
				try {
					const result = await this.plugin.syncService.forceSyncAll();
					new Notice(
						t('settings.sync.force.success').replace('{count}', String(result.syncedCount)),
					);
				} catch (error) {
					const detail = error instanceof Error ? error.message : String(error);
					new Notice(`${t('settings.sync.force.fail')}：${detail}`);
				} finally {
					btn.setDisabled(false).setButtonText(idleText);
				}
			};
			btn.setButtonText(idleText).onClick(() => {
				new ConfirmModal(this.app, {
					message: t('settings.sync.force.confirm'),
					confirmText: idleText,
					onConfirm: () => {
						void runForceSync();
					},
				}).open();
			});
		});
	}

	private renderAboutSetting(setting: Setting): void {
		setting.addButton((btn) => {
			btn.buttonEl.classList.add('aulyckanban-settings-action-button');
			btn.setIcon('info');
			btn.buttonEl.createSpan({
				cls: 'aulyckanban-accessible-label',
				text: t('settings.about.name'),
			});
			btn.onClick(() => {
				new AboutModal(
					this.app,
					this.plugin.manifest.version,
					this.plugin.manifest.minAppVersion,
				).open();
			});
		});
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
