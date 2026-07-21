import { App, Modal, setIcon } from 'obsidian';
import { t } from '../i18n';

const OFFICIAL_SITE_URL = 'https://aulyc.com';

const INTRODUCTION_KEYS = [
	'about.introduction.line1',
	'about.introduction.line2',
	'about.introduction.line3',
] as const;

const ACKNOWLEDGEMENT_KEYS = [
	'about.acknowledgements.line1',
	'about.acknowledgements.line2',
	'about.acknowledgements.line3',
	'about.acknowledgements.line4',
	'about.acknowledgements.line5',
] as const;

/** 关于弹窗：以单页信息卡展示产品身份、说明和致谢。 */
export class AboutModal extends Modal {
	constructor(
		app: App,
		private readonly version: string,
		private readonly minAppVersion: string,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, modalEl, titleEl } = this;
		modalEl.addClass('aulyckanban-about-modal');

		this.setTitle('');
		titleEl.addClass('aulyckanban-about-title');
		const titleIcon = titleEl.createSpan({ cls: 'aulyckanban-about-title-icon' });
		titleIcon.setAttribute('aria-hidden', 'true');
		setIcon(titleIcon, 'info');
		titleEl.createSpan({ text: t('about.title') });

		contentEl.empty();
		const container = contentEl.createDiv({ cls: 'aulyckanban-about-content' });

		const metadata = container.createDiv({ cls: 'aulyckanban-about-metadata' });
		for (const [label, value] of [
			[t('about.version'), this.version],
			[t('about.requirements'), `Obsidian ${this.minAppVersion}+`],
		] as const) {
			const row = metadata.createDiv({ cls: 'aulyckanban-about-metadata-row' });
			row.createSpan({ cls: 'aulyckanban-about-metadata-label', text: label });
			row.createSpan({ cls: 'aulyckanban-about-metadata-value', text: value });
		}

		const createTextSection = (title: string, lines: readonly string[]): void => {
			const section = container.createDiv({ cls: 'aulyckanban-about-section' });
			section.createEl('h3', { cls: 'aulyckanban-about-section-title', text: title });
			for (const line of lines) {
				section.createEl('p', { cls: 'aulyckanban-about-line', text: line });
			}
		};

		createTextSection(
			t('about.introduction'),
			INTRODUCTION_KEYS.map((key) => t(key)),
		);

		const website = container.createDiv({ cls: 'aulyckanban-about-section' });
		website.createEl('h3', {
			cls: 'aulyckanban-about-section-title',
			text: t('about.website'),
		});
		const websiteLink = website.createEl('a', {
			cls: 'aulyckanban-about-website',
			text: OFFICIAL_SITE_URL,
		});
		websiteLink.setAttribute('href', OFFICIAL_SITE_URL);
		websiteLink.setAttribute('target', '_blank');
		websiteLink.setAttribute('rel', 'noopener noreferrer');

		createTextSection(
			t('about.acknowledgements'),
			ACKNOWLEDGEMENT_KEYS.map((key) => t(key)),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
