import { App, Notice, normalizePath, PluginSettingTab, Setting } from 'obsidian';
import { t } from '../i18n';
import type { PluginSettings, SyncMode } from '../types';
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
		const syncMode = settings.syncMode ?? 'aggregate';
		new Setting(containerEl)
			.setName(t('settings.sync.mode.name'))
			.setDesc(t('settings.sync.mode.desc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('aggregate', t('settings.sync.mode.aggregate'))
					.addOption('per-view', t('settings.sync.mode.perView'))
					.setValue(syncMode)
					.onChange(async (value) => {
						this.plugin.store.dispatch({
							type: 'UPDATE_SETTINGS',
							payload: { syncMode: value as SyncMode },
						});
						try {
							await this.plugin.store.saveNow();
						} catch {
							return;
						}
						this.display();
						this.plugin.syncService.scheduleSyncAllViews();
					}),
			);

		if (syncMode === 'aggregate') {
			this.buildSyncPathSetting(containerEl, {
				name: t('settings.sync.aggregatePath.name'),
				desc: t('settings.sync.aggregatePath.desc'),
				placeholder: t('settings.sync.aggregatePath.placeholder'),
				currentPath: settings.aggregate?.filePath ?? '',
				otherPaths: [
					...Object.values(settings.viewSyncTargets).map((target) => target.filePath),
					settings.archive?.filePath ?? '',
				],
				payload: (filePath) => ({ aggregate: { filePath } }),
				scheduleSync: () => this.plugin.syncService.scheduleSyncAllViews(),
			});
		} else {
			for (const view of this.plugin.store.getTaskViews()) {
				const currentPath = settings.viewSyncTargets[view.id]?.filePath ?? '';
				const otherPaths = [
					...Object.entries(settings.viewSyncTargets)
						.filter(([id]) => id !== view.id)
						.map(([, target]) => target.filePath),
					settings.archive?.filePath ?? '',
					settings.aggregate?.filePath ?? '',
				];
				this.buildSyncPathSetting(containerEl, {
					name: `${view.title}${t('settings.sync.viewPath.suffix')}`,
					desc: t('settings.sync.viewPath.desc'),
					placeholder: `${view.title}.md`,
					currentPath,
					otherPaths,
					payload: (filePath) => ({ viewSyncTargets: { [view.id]: { filePath } } }),
					scheduleSync: () => this.plugin.syncService.scheduleSyncView(view.id),
				});
			}

			this.buildSyncPathSetting(containerEl, {
				name: t('settings.sync.archivePath.name'),
				desc: t('settings.sync.archivePath.desc'),
				placeholder: t('settings.sync.archivePath.placeholder'),
				currentPath: settings.archive?.filePath ?? '',
				otherPaths: [
					...Object.values(settings.viewSyncTargets).map((target) => target.filePath),
					settings.aggregate?.filePath ?? '',
				],
				payload: (filePath) => ({ archive: { filePath } }),
				scheduleSync: () => this.plugin.syncService.scheduleSyncArchive(),
			});
		}

		const hintEl = containerEl.createDiv({
			cls: 'setting-item-description aulyckanban-settings-hint',
		});
		hintEl.setText(`💡 ${t('settings.sync.hint')}`);
	}

	private buildSyncPathSetting(
		containerEl: HTMLElement,
		opts: {
			name: string;
			desc: string;
			placeholder: string;
			currentPath: string;
			otherPaths: string[];
			payload: (filePath: string) => Partial<PluginSettings>;
			scheduleSync: () => void;
		},
	): void {
		new Setting(containerEl)
			.setName(opts.name)
			.setDesc(opts.desc)
			.addText((text) => {
				let latestPath = opts.currentPath;
				text
					.setPlaceholder(opts.placeholder)
					.setValue(opts.currentPath)
					.onChange(async (value) => {
						const normalized = value.trim() ? normalizePath(value.trim()) : '';
						const isDuplicate =
							normalized && opts.otherPaths.some((p) => p && normalized === normalizePath(p));
						if (isDuplicate) {
							new Notice(t('settings.sync.duplicateError'));
							return;
						}
						latestPath = normalized;
						this.plugin.store.dispatch({
							type: 'UPDATE_SETTINGS',
							payload: opts.payload(normalized),
						});
						try {
							await this.plugin.store.saveNow();
						} catch {
							// persistData 已提示用户并安排重试
						}
					});
				text.inputEl.addEventListener('change', () => {
					if (latestPath) opts.scheduleSync();
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
		try {
			await this.plugin.store.saveNow();
			new Notice(t('settings.clear.success'));
		} catch {
			// persistData 已提示保存失败并安排重试
		}
	}
}
