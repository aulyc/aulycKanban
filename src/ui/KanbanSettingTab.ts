import { App, Notice, normalizePath, PluginSettingTab, Setting } from 'obsidian';
import { t } from '../i18n';
import type KanbanPlugin from '../main';
import { BackupService } from '../services/backupService';
import { ClearDataModal } from './ClearDataModal';
import { ConfirmModal } from './ConfirmModal';
import { FileSuggest } from './FileSuggest';

/**
 * 看板设置页（PluginSettingTab）
 * 包含三个区块：外观设置 / 数据管理 / 笔记同步
 */
export class KanbanSettingTab extends PluginSettingTab {
	plugin: KanbanPlugin;
	private backupService: BackupService;

	constructor(app: App, plugin: KanbanPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.backupService = new BackupService(plugin.store);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ==================== 外观设置 ====================
		new Setting(containerEl).setHeading().setName(t('settings.appearance'));

		this.buildIconSetting(containerEl);

		// ==================== 数据管理 ====================
		new Setting(containerEl).setHeading().setName(t('settings.dataManagement'));

		// 备份数据
		new Setting(containerEl)
			.setName(t('settings.backup.name'))
			.setDesc(t('settings.backup.desc'))
			.addButton((btn) =>
				btn.setButtonText(t('settings.backup.button')).onClick(async () => {
					await this.backupService.exportBackup();
				}),
			);

		// 导入数据
		new Setting(containerEl)
			.setName(t('settings.import.name'))
			.setDesc(t('settings.import.desc'))
			.addButton((btn) =>
				btn.setButtonText(t('settings.import.button')).onClick(() => {
					new ConfirmModal(this.app, {
						message: t('settings.import.confirm'),
						onConfirm: async () => {
							await this.backupService.importBackup();
						},
					}).open();
				}),
			);

		// 清除所有数据
		new Setting(containerEl)
			.setName(t('settings.clear.name'))
			.setDesc(t('settings.clear.desc'))
			.addButton((btn) =>
				btn
					.setButtonText(t('settings.clear.button'))
					.setWarning()
					.onClick(() => {
						new ClearDataModal(this.app, {
							onBackup: async () => {
								await this.backupService.exportBackup();
							},
							onConfirmClear: async () => {
								this.plugin.store.dispatch({ type: 'CLEAR_ALL_DATA' });
								await this.plugin.store.saveNow();
								new Notice(t('settings.clear.success'));
							},
						}).open();
					}),
			);

		// ==================== 笔记同步 ====================
		new Setting(containerEl).setHeading().setName(t('settings.sync'));

		const settings = this.plugin.store.getSettings();

		// 工作任务同步文件路径
		new Setting(containerEl)
			.setName(t('settings.sync.workPath.name'))
			.setDesc(t('settings.sync.workPath.desc'))
			.addText((text) => {
				text
					.setPlaceholder('看板/工作任务.md')
					.setValue(settings.work.filePath)
					.onChange(async (value) => {
						const normalized = value.trim() ? normalizePath(value.trim()) : '';
						if (normalized && normalized === normalizePath(settings.personal.filePath || '')) {
							new Notice(t('settings.sync.duplicateError'));
							return;
						}
						this.plugin.store.dispatch({
							type: 'UPDATE_SETTINGS',
							payload: { work: { filePath: normalized } },
						});
						await this.plugin.store.saveNow();
					});
				new FileSuggest(this.app, text.inputEl);
			});

		// 个人任务同步文件路径
		new Setting(containerEl)
			.setName(t('settings.sync.personalPath.name'))
			.setDesc(t('settings.sync.personalPath.desc'))
			.addText((text) => {
				text
					.setPlaceholder('看板/个人任务.md')
					.setValue(settings.personal.filePath)
					.onChange(async (value) => {
						const normalized = value.trim() ? normalizePath(value.trim()) : '';
						if (normalized && normalized === normalizePath(settings.work.filePath || '')) {
							new Notice(t('settings.sync.duplicateError'));
							return;
						}
						this.plugin.store.dispatch({
							type: 'UPDATE_SETTINGS',
							payload: { personal: { filePath: normalized } },
						});
						await this.plugin.store.saveNow();
					});
				new FileSuggest(this.app, text.inputEl);
			});

		// 归档同步文件路径
		new Setting(containerEl)
			.setName(t('settings.sync.archivePath.name'))
			.setDesc(t('settings.sync.archivePath.desc'))
			.addText((text) => {
				text
					.setPlaceholder('看板/归档任务.md')
					.setValue(settings.archive?.filePath ?? '')
					.onChange(async (value) => {
						const normalized = value.trim() ? normalizePath(value.trim()) : '';
						const workPath = normalizePath(settings.work.filePath || '');
						const personalPath = normalizePath(settings.personal.filePath || '');
						if (normalized && (normalized === workPath || normalized === personalPath)) {
							new Notice(t('settings.sync.duplicateError'));
							return;
						}
						this.plugin.store.dispatch({
							type: 'UPDATE_SETTINGS',
							payload: { archive: { filePath: normalized } },
						});
						await this.plugin.store.saveNow();
					});
				new FileSuggest(this.app, text.inputEl);
			});

		// 同步提示
		const hintEl = containerEl.createDiv({ cls: 'setting-item-description' });
		hintEl.style.marginTop = '8px';
		hintEl.style.paddingLeft = '16px';
		hintEl.setText(`💡 ${t('settings.sync.hint')}`);
	}

	/**
	 * 构建图标设置区
	 */
	private buildIconSetting(containerEl: HTMLElement): void {
		const settings = this.plugin.store.getSettings();

		// 图标预览
		const previewSetting = new Setting(containerEl)
			.setName(t('settings.icon.name'))
			.setDesc(t('settings.icon.desc'));

		// 上传按钮
		previewSetting.addButton((btn) =>
			btn.setButtonText(t('settings.icon.upload')).onClick(() => {
				const input = document.createElement('input');
				input.type = 'file';
				input.accept = 'image/png';

				input.onchange = async (e: Event): Promise<void> => {
					const target = e.target as HTMLInputElement;
					const file = target.files?.[0];
					if (!file) return;

					// PNG 格式校验
					if (file.type !== 'image/png') {
						new Notice(t('settings.icon.formatError'));
						return;
					}

					// 大小校验
					if (file.size > 500 * 1024) {
						new Notice(t('settings.icon.sizeError'));
						return;
					}

					const reader = new FileReader();
					reader.onload = async (event): Promise<void> => {
						const result = event.target?.result as string;
						if (result) {
							this.plugin.store.dispatch({
								type: 'UPDATE_SETTINGS',
								payload: { customIcon: result },
							});
							await this.plugin.store.saveNow();
							new Notice(t('settings.icon.selected'));
							this.display(); // 刷新设置页
						}
					};
					reader.readAsDataURL(file);
				};

				input.click();
			}),
		);

		// 恢复默认按钮（仅当有自定义图标时显示）
		if (settings.customIcon) {
			previewSetting.addButton((btn) =>
				btn.setButtonText(t('settings.icon.reset')).onClick(() => {
					new ConfirmModal(this.app, {
						message: t('settings.icon.resetConfirm'),
						onConfirm: async () => {
							this.plugin.store.dispatch({
								type: 'UPDATE_SETTINGS',
								payload: { customIcon: '' },
							});
							await this.plugin.store.saveNow();
							new Notice(t('settings.icon.restored'));
							this.display(); // 刷新设置页
						},
					}).open();
				}),
			);
		}
	}
}
