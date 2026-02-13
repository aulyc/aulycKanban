import { AbstractInputSuggest, App, TFile } from 'obsidian';

/**
 * 文件路径模糊搜索下拉框
 * 输入时自动弹出 Vault 中匹配的 .md 文件列表
 */
export class FileSuggest extends AbstractInputSuggest<TFile> {
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(query: string): TFile[] {
		const files = this.app.vault.getMarkdownFiles();
		const lowerQuery = query.toLowerCase();

		if (!lowerQuery) {
			// 无输入时显示前 20 个文件
			return files.slice(0, 20);
		}

		return files
			.filter((file) => file.path.toLowerCase().includes(lowerQuery))
			.slice(0, 20);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile): void {
		this.inputEl.value = file.path;
		this.inputEl.dispatchEvent(new Event('input'));
		this.inputEl.trigger('change');
		this.close();
	}
}
