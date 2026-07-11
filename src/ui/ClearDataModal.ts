import { App, Modal } from 'obsidian';
import { t } from '../i18n';

/**
 * 清除数据专用弹窗
 * 无分隔线、无关闭按钮
 * 按钮行：备份数据 | 取消 | 确认清除
 */
export class ClearDataModal extends Modal {
	private readonly onBackup: () => void;
	private readonly onConfirmClear: () => void;

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
		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass('aulyckanban-modal-clean');

		contentEl.createDiv({
			text: t('settings.clear.warning'),
			cls: 'aulyckanban-modal-message',
		});

		const suggestionEl = contentEl.createDiv({ cls: 'aulyckanban-clear-suggestion' });
		suggestionEl.createEl('strong', { text: '💡 ' });
		suggestionEl.appendText(t('settings.clear.suggestion'));

		const btnRow = contentEl.createDiv({ cls: 'aulyckanban-modal-buttons' });

		const backupBtn = btnRow.createEl('button', {
			text: t('settings.clear.backupFirst'),
			cls: 'aulyckanban-modal-btn mod-cta',
		});
		backupBtn.addEventListener('click', () => this.onBackup());

		const cancelBtn = btnRow.createEl('button', {
			text: t('cancel'),
			cls: 'aulyckanban-modal-btn',
		});
		cancelBtn.addEventListener('click', () => this.close());

		const confirmBtn = btnRow.createEl('button', {
			text: t('settings.clear.confirm'),
			cls: 'aulyckanban-modal-btn mod-warning',
		});
		confirmBtn.addEventListener('click', () => {
			this.onConfirmClear();
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
