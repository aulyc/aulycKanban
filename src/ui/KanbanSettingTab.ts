import { AbstractInputSuggest, App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type { SettingDefinitionItem, TFolder } from 'obsidian';
import { t, type I18nKey } from '../i18n';
import type KanbanPlugin from '../main';
import { BackupService } from '../services/backupService';
import { normalizeSyncFolder } from '../utils/noteSync';
import { AboutModal } from './AboutModal';
import { ClearDataModal } from './ClearDataModal';
import { ConfirmModal } from './ConfirmModal';

export function filterVaultFolders(app: App, query: string): string[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	return app.vault
		.getRoot()
		.children.filter((file): file is TFolder => 'children' in file)
		.map((folder) => folder.path)
		.filter(
			(path) =>
				path.length > 0 &&
				!path.includes('/') &&
				path.toLocaleLowerCase().includes(normalizedQuery),
		)
		.sort((left, right) => left.localeCompare(right));
}

class VaultFolderSuggest extends AbstractInputSuggest<string> {
	private readonly inputEl: HTMLInputElement;
	private readonly onChoose: (folder: string) => void;
	private showAllOnNextQuery = false;

	constructor(app: App, inputEl: HTMLInputElement, onChoose: (folder: string) => void) {
		super(app, inputEl);
		this.inputEl = inputEl;
		this.onChoose = onChoose;
		this.inputEl.addEventListener('focus', this.handleFocus);
	}

	open(): void {
		super.open();
		this.syncWidthToInput();
	}

	protected getSuggestions(query: string): string[] {
		const effectiveQuery = this.showAllOnNextQuery ? '' : query;
		this.showAllOnNextQuery = false;
		return filterVaultFolders(this.app, effectiveQuery);
	}

	renderSuggestion(folder: string, el: HTMLElement): void {
		el.setText(folder);
	}

	selectSuggestion(folder: string): void {
		this.setValue(folder);
		this.onChoose(folder);
		this.close();
	}

	destroy(): void {
		this.inputEl.removeEventListener('focus', this.handleFocus);
		this.close();
	}

	private readonly handleFocus = (): void => {
		this.showAllOnNextQuery = true;
		const EventConstructor = this.inputEl.ownerDocument.defaultView?.Event ?? Event;
		const inputEvent = new EventConstructor('input', { bubbles: true });
		this.inputEl.dispatchEvent(inputEvent);
	};

	private syncWidthToInput(): void {
		const width = this.inputEl.getBoundingClientRect().width;
		if (width <= 0) return;
		const suggestEl = (this as unknown as { suggestEl?: HTMLElement }).suggestEl;
		if (!suggestEl) return;
		suggestEl.classList.add('aulyckanban-folder-suggest');
		suggestEl.setCssStyles({
			width: `${width}px`,
			minWidth: `${width}px`,
			maxWidth: `${width}px`,
		});
	}
}

/**
 * 看板设置页（PluginSettingTab）
 * 包含数据管理、笔记同步和关于入口
 */
export class KanbanSettingTab extends PluginSettingTab {
	private readonly plugin: KanbanPlugin;
	private readonly backupService: BackupService;
	private folderSuggest: VaultFolderSuggest | null = null;

	constructor(app: App, plugin: KanbanPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.backupService = new BackupService(plugin.store);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
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
		const { containerEl } = this;
		this.destroyFolderSuggest();
		containerEl.empty();

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

	private renderSyncFolderSetting(setting: Setting): () => void {
		const settings = this.plugin.store.getSettings();
		let latestFolder = settings.syncFolder;
		let suggest: VaultFolderSuggest | null = null;
		setting.addText((text) => {
			const persistFolder = async (value: string): Promise<void> => {
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
			};
			text
				.setPlaceholder(t('settings.sync.folder.placeholder'))
				.setValue(settings.syncFolder)
				.onChange(persistFolder);
			text.inputEl.classList.add('aulyckanban-sync-folder-input');
			text.inputEl.addEventListener('change', () => {
				if (latestFolder) this.plugin.syncService.scheduleSyncAllViews();
			});
			suggest = new VaultFolderSuggest(this.app, text.inputEl, (folder) => {
				void persistFolder(folder);
				this.plugin.syncService.scheduleSyncAllViews();
			});
			this.destroyFolderSuggest();
			this.folderSuggest = suggest;
		});
		return () => {
			suggest?.destroy();
			if (this.folderSuggest === suggest) this.folderSuggest = null;
		};
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

	hide(): void {
		this.destroyFolderSuggest();
		super.hide();
	}

	private destroyFolderSuggest(): void {
		this.folderSuggest?.destroy();
		this.folderSuggest = null;
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
