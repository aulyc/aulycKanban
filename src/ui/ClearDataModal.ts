import { App, Modal, Setting } from 'obsidian';
import { t } from '../i18n';

/**
 * 清除数据专用弹窗
 * 替代原思源版的 clearAllData 弹窗
 * 包含：警告文字 + "先备份数据"按钮 + "确认清除"按钮
 */
export class ClearDataModal extends Modal {
	private onBackup: () => void;
	private onConfirmClear: () => void;

	constructor(
		app: App,
		options: {
			onBackup: () => void;
			onConfirmClear: () => void;
		},
	) {
		super(app);
		this.onBackup = options.onBackup;
		this.onConfirmClear = options.onConfirmClear;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('xaulyc-clear-modal');

		this.setTitle(t('settings.clear.title'));

		// 警告文字
		contentEl.createDiv({
			text: t('settings.clear.warning'),
			cls: 'xaulyc-clear-warning',
		});

		// 建议区块
		const suggestionEl = contentEl.createDiv({ cls: 'xaulyc-clear-suggestion' });
		suggestionEl.createEl('strong', { text: '💡 ' });
		suggestionEl.appendText(t('settings.clear.suggestion'));

		// 备份按钮
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText(t('settings.clear.backupFirst'))
					.setCta()
					.onClick(() => {
						this.onBackup();
					}),
			);

		// 底部操作区：取消 + 确认清除
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText(t('cancel'))
					.onClick(() => {
						this.close();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText(t('settings.clear.confirm'))
					.setWarning()
					.onClick(() => {
						this.onConfirmClear();
						this.close();
					}),
			);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
