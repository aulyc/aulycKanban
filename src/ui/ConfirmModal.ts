import { App, Modal, Setting } from 'obsidian';
import { t } from '../i18n';

/**
 * 通用确认弹窗
 * 替代原思源版的 showConfirmDialog
 */
export class ConfirmModal extends Modal {
	private message: string;
	private onConfirm: () => void;
	private confirmText: string;
	private cancelText: string;
	private isDestructive: boolean;

	constructor(
		app: App,
		options: {
			message: string;
			onConfirm: () => void;
			confirmText?: string;
			cancelText?: string;
			isDestructive?: boolean;
		},
	) {
		super(app);
		this.message = options.message;
		this.onConfirm = options.onConfirm;
		this.confirmText = options.confirmText ?? t('confirm');
		this.cancelText = options.cancelText ?? t('cancel');
		this.isDestructive = options.isDestructive ?? false;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		// 消息文本
		contentEl.createDiv({
			text: this.message,
			cls: 'xaulyc-confirm-message',
		});

		// 按钮区
		const btnSetting = new Setting(contentEl);

		btnSetting.addButton((btn) =>
			btn
				.setButtonText(this.cancelText)
				.onClick(() => {
					this.close();
				}),
		);

		btnSetting.addButton((btn) => {
			btn.setButtonText(this.confirmText)
				.setCta()
				.onClick(() => {
					this.onConfirm();
					this.close();
				});

			if (this.isDestructive) {
				btn.setWarning();
			}

			return btn;
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
