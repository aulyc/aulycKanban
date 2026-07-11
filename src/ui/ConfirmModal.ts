import { App, Modal } from 'obsidian';
import { t } from '../i18n';

/**
 * 通用确认弹窗
 * 无分隔线、无关闭按钮，内容和按钮水平居中
 */
export class ConfirmModal extends Modal {
	private readonly message: string;
	private readonly onConfirm: () => void;
	private readonly confirmText: string;
	private readonly cancelText: string;
	private readonly isDestructive: boolean;

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
		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass('aulyckanban-modal-clean');

		contentEl.createDiv({
			text: this.message,
			cls: 'aulyckanban-modal-message',
		});

		const btnRow = contentEl.createDiv({ cls: 'aulyckanban-modal-buttons' });

		const cancelBtn = btnRow.createEl('button', {
			text: this.cancelText,
			cls: 'aulyckanban-modal-btn',
		});
		cancelBtn.addEventListener('click', () => this.close());

		const confirmBtn = btnRow.createEl('button', {
			text: this.confirmText,
			cls: `aulyckanban-modal-btn mod-cta${this.isDestructive ? ' mod-warning' : ''}`,
		});
		confirmBtn.addEventListener('click', () => {
			this.onConfirm();
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
