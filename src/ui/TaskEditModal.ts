import { App, Modal, Setting } from 'obsidian';
import { t } from '../i18n';

/**
 * 任务编辑弹窗
 * 替代原思源版的 showInputDialog
 * 支持多行输入、Ctrl+Enter 提交
 */
export class TaskEditModal extends Modal {
	private readonly title: string;
	private readonly placeholder: string;
	private readonly defaultValue: string;
	private readonly onSubmit: (result: string) => void;
	private textareaEl: HTMLTextAreaElement | null = null;

	constructor(
		app: App,
		options: {
			title: string;
			placeholder: string;
			defaultValue?: string;
			onSubmit: (result: string) => void;
		},
	) {
		super(app);
		this.title = options.title;
		this.placeholder = options.placeholder;
		this.defaultValue = options.defaultValue ?? '';
		this.onSubmit = options.onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		this.setTitle(this.title);

		// 文本域容器
		const textareaContainer = contentEl.createDiv({ cls: 'xaulyc-modal-textarea-container' });
		this.textareaEl = textareaContainer.createEl('textarea', {
			cls: 'xaulyc-modal-textarea',
			attr: {
				placeholder: this.placeholder,
				rows: '4',
			},
		});
		this.textareaEl.value = this.defaultValue;

		// 样式设置（使用 class 而非内联样式，但 textarea 需要基本尺寸）
		this.textareaEl.style.width = '100%';
		this.textareaEl.style.minHeight = '80px';
		this.textareaEl.style.resize = 'vertical';
		this.textareaEl.style.fontFamily = 'inherit';
		this.textareaEl.style.fontSize = '14px';
		this.textareaEl.style.lineHeight = '1.5';
		this.textareaEl.style.padding = '8px';
		this.textareaEl.style.boxSizing = 'border-box';

		// Ctrl+Enter / Cmd+Enter 提交
		this.textareaEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				this.handleSubmit();
			}
		});

		// 按钮区
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText(t('task.cancel'))
					.onClick(() => {
						this.close();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText(t('task.submit'))
					.setCta()
					.onClick(() => {
						this.handleSubmit();
					}),
			);

		// 自动聚焦并将光标移到末尾
		setTimeout(() => {
			if (this.textareaEl) {
				this.textareaEl.focus();
				this.textareaEl.setSelectionRange(
					this.textareaEl.value.length,
					this.textareaEl.value.length,
				);
			}
		}, 50);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.textareaEl = null;
	}

	private handleSubmit(): void {
		const value = this.textareaEl?.value.trim();
		if (value) {
			this.onSubmit(value);
		}
		this.close();
	}
}
