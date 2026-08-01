import { App, Modal, Setting, setIcon } from 'obsidian';
import { t } from '../i18n';
import type { UpdateManifest, UpdateSource } from '../services/updateManifest';

export interface UpdateModalOptions {
	currentVersion: string;
	manifest: UpdateManifest;
	source: UpdateSource;
}

/** 展示发现的正式版本，并由用户明确打开官方下载页面。 */
export class UpdateModal extends Modal {
	constructor(
		app: App,
		private readonly options: UpdateModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, modalEl, titleEl } = this;
		modalEl.addClass('aulyckanban-update-modal');
		this.setTitle('');
		titleEl.addClass('aulyckanban-update-title');
		const icon = titleEl.createSpan({ cls: 'aulyckanban-update-title-icon' });
		icon.setAttribute('aria-hidden', 'true');
		setIcon(icon, 'package-check');
		titleEl.createSpan({ text: t('update.title') });

		contentEl.empty();
		const container = contentEl.createDiv({ cls: 'aulyckanban-update-content' });
		const metadata = container.createDiv({ cls: 'aulyckanban-update-metadata' });
		for (const [label, value] of [
			[t('update.currentVersion'), this.options.currentVersion],
			[t('update.availableVersion'), this.options.manifest.version],
			[
				t('update.source'),
				t(this.options.source === 'github' ? 'update.source.github' : 'update.source.gitee'),
			],
		] as const) {
			const row = metadata.createDiv({ cls: 'aulyckanban-update-metadata-row' });
			row.createSpan({ cls: 'aulyckanban-update-metadata-label', text: label });
			row.createSpan({ cls: 'aulyckanban-update-metadata-value', text: value });
		}

		container.createEl('p', {
			cls: 'aulyckanban-update-status',
			text: t('update.downloadHint'),
		});
		const actions = container.createDiv({ cls: 'aulyckanban-update-actions' });
		new Setting(actions).addButton((button) => {
			button
				.setButtonText(t('update.openDownloadPage'))
				.setCta()
				.onClick(() => {
					const link = container.createEl('a');
					link.setAttribute('href', this.options.manifest.releasePageURL);
					link.setAttribute('target', '_blank');
					link.setAttribute('rel', 'noopener noreferrer');
					link.click();
					link.remove();
				});
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
