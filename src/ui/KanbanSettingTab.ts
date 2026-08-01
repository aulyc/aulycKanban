import { AbstractInputSuggest, App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { t } from '../i18n';
import type KanbanPlugin from '../main';
import { BackupService } from '../services/backupService';
import { normalizeSyncFolder } from '../utils/noteSync';
import { AboutModal } from './AboutModal';
import { ClearDataModal } from './ClearDataModal';
import { ConfirmModal } from './ConfirmModal';

export function filterVaultFolders(app: App, query: string): string[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	return app.vault
		.getAllFolders()
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
		this.syncWidthToInput();
		super.open();
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
		const inputEvent = this.inputEl.ownerDocument.createEvent('Event');
		inputEvent.initEvent('input', true, false);
		this.inputEl.dispatchEvent(inputEvent);
	};

	private syncWidthToInput(): void {
		const width = this.inputEl.getBoundingClientRect().width;
		if (width <= 0) return;
		const suggestEl = (this as unknown as { suggestEl?: HTMLElement }).suggestEl;
		if (!suggestEl) return;
		suggestEl.classList.add('aulyckanban-folder-suggest');
		suggestEl.style.setProperty('--aulyckanban-folder-suggest-width', `${width}px`);
	}
}

/**
 * 看板设置页（PluginSettingTab）
 * 包含两个区块：数据管理 / 笔记同步
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

	display(): void {
		const { containerEl } = this;
		this.folderSuggest?.destroy();
		this.folderSuggest = null;
		containerEl.empty();

		// ==================== 数据管理 ====================
		new Setting(containerEl).setHeading().setName(t('settings.dataManagement'));

		new Setting(containerEl)
			.setName(t('settings.backup.name'))
			.setDesc(t('settings.backup.desc'))
			.addButton((btn) => {
				btn.buttonEl.classList.add('aulyckanban-settings-action-button');
				btn.setButtonText(t('settings.backup.button')).onClick(async () => {
					await this.backupService.exportBackup();
				});
			});

		new Setting(containerEl)
			.setName(t('settings.import.name'))
			.setDesc(t('settings.import.desc'))
			.addButton((btn) => {
				btn.buttonEl.classList.add('aulyckanban-settings-action-button');
				btn.setButtonText(t('settings.import.button')).onClick(() => {
					new ConfirmModal(this.app, {
						message: t('settings.import.confirm'),
						onConfirm: () => {
							void this.backupService.importBackup();
						},
					}).open();
				});
			});

		new Setting(containerEl)
			.setName(t('settings.clear.name'))
			.setDesc(t('settings.clear.desc'))
			.addButton((btn) => {
				btn.buttonEl.classList.add('aulyckanban-settings-action-button');
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
					});
			});

		// ==================== 笔记同步 ====================
		new Setting(containerEl).setHeading().setName(t('settings.sync'));

		const settings = this.plugin.store.getSettings();
		new Setting(containerEl)
			.setName(t('settings.sync.folder.name'))
			.setDesc(t('settings.sync.folder.desc'))
			.addText((text) => {
				let latestFolder = settings.syncFolder;
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
				this.folderSuggest = new VaultFolderSuggest(this.app, text.inputEl, (folder) => {
					void persistFolder(folder);
					this.plugin.syncService.scheduleSyncAllViews();
				});
			});

		new Setting(containerEl)
			.setName(t('settings.sync.force.name'))
			.setDesc(t('settings.sync.force.desc'))
			.addButton((btn) => {
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

		// ==================== 插件更新 ====================
		new Setting(containerEl).setHeading().setName(t('settings.updates'));

		new Setting(containerEl)
			.setName(t('settings.updates.auto.name'))
			.setDesc(t('settings.updates.auto.desc'))
			.addToggle((toggle) => {
				toggle.setValue(settings.autoCheckUpdates).onChange(async (value) => {
					this.plugin.store.dispatch({
						type: 'UPDATE_SETTINGS',
						payload: { autoCheckUpdates: value },
					});
					try {
						await this.plugin.store.saveNow();
					} catch {
						// persistData 已提示用户并安排重试
					}
				});
			});

		new Setting(containerEl)
			.setName(t('settings.updates.check.name'))
			.setDesc(t('settings.updates.check.desc'))
			.addButton((btn) => {
				btn.buttonEl.classList.add('aulyckanban-settings-action-button');
				const idleText = t('settings.updates.check.button');
				btn.setButtonText(idleText).onClick(async () => {
					btn.setDisabled(true).setButtonText(t('settings.updates.check.running'));
					try {
						await this.plugin.checkForUpdates(true);
					} finally {
						btn.setDisabled(false).setButtonText(idleText);
					}
				});
			});

		// ==================== 关于 ====================
		new Setting(containerEl)
			.setName(t('settings.about.name'))
			.setDesc(t('settings.about.desc'))
			.addButton((btn) => {
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
		this.folderSuggest?.destroy();
		this.folderSuggest = null;
		super.hide();
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
