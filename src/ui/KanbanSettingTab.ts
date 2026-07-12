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

		for (const view of this.plugin.store.getTaskViews()) {
			const currentPath = settings.viewSyncTargets[view.id]?.filePath ?? '';
			const otherPaths = [
				...Object.entries(settings.viewSyncTargets)
					.filter(([id]) => id !== view.id)
					.map(([, target]) => target.filePath),
				settings.archive?.filePath ?? '',
			];
			this.buildSyncPathSetting(containerEl, {
				name: `${view.title}${t('settings.sync.viewPath.suffix')}`,
				desc: t('settings.sync.viewPath.desc'),
				placeholder: `${view.title}.md`,
				currentPath,
				otherPaths,
				payload: (filePath) => ({ viewSyncTargets: { [view.id]: { filePath } } }),
			});
		}

		this.buildSyncPathSetting(containerEl, {
			nameKey: 'settings.sync.archivePath.name',
			descKey: 'settings.sync.archivePath.desc',
			placeholderKey: 'settings.sync.archivePath.placeholder',
			currentPath: settings.archive?.filePath ?? '',
			otherPaths: Object.values(settings.viewSyncTargets).map((target) => target.filePath),
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
			nameKey?: string;
			descKey?: string;
			placeholderKey?: string;
			name?: string;
			desc?: string;
			placeholder?: string;
			currentPath: string;
			otherPaths: string[];
			payload: (filePath: string) => Partial<import('../types').PluginSettings>;
		},
	): void {
		new Setting(containerEl)
			.setName(opts.name ?? t(opts.nameKey ?? ''))
			.setDesc(opts.desc ?? t(opts.descKey ?? ''))
			.addText((text) => {
				text
					.setPlaceholder(opts.placeholder ?? t(opts.placeholderKey ?? ''))
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
