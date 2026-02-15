import { t } from '../i18n';
import type { KanbanStore } from '../store';
import type { ViewKind } from '../types';

/**
 * 顶部工具栏组件
 * 包含视图切换标签 + 归档按钮 + 设置按钮
 */
export class Toolbar {
	private readonly el: HTMLElement;
	private readonly store: KanbanStore;

	constructor(parentEl: HTMLElement, store: KanbanStore) {
		this.store = store;
		this.el = parentEl.createDiv({ cls: 'xaulyc-toolbar' });
		this.render();
	}

	render(): void {
		this.el.empty();

		const currentView = this.store.getCurrentView();
		const isArchive = this.store.isShowingArchive();

		// 左侧：自定义图标 + 视图切换标签
		const leftEl = this.el.createDiv({ cls: 'xaulyc-toolbar-left' });

		// 自定义图标（设置中上传的）
		const customIcon = this.store.getSettings().customIcon;
		if (customIcon) {
			const iconEl = leftEl.createEl('img', {
				cls: 'xaulyc-toolbar-icon',
				attr: { src: customIcon },
			});
			iconEl.alt = 'Kanban';
		}

		this.createTab(leftEl, 'work', t('view.work'), currentView === 'work' && !isArchive);
		this.createTab(leftEl, 'personal', t('view.personal'), currentView === 'personal' && !isArchive);

		// 归档按钮：放在个人任务右侧，样式与 tab 一致
		const archiveBtn = leftEl.createEl('button', {
			text: `📦 ${t('archive.button')}`,
			cls: isArchive ? 'xaulyc-tab xaulyc-tab-active' : 'xaulyc-tab',
		});
		archiveBtn.setAttribute('aria-label', t('archive.tooltip'));
		archiveBtn.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
		});
	}

	private createTab(parentEl: HTMLElement, view: ViewKind, label: string, isActive: boolean): void {
		const cls = isActive ? 'xaulyc-tab xaulyc-tab-active' : 'xaulyc-tab';
		const btn = parentEl.createEl('button', { text: label, cls });

		btn.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (this.store.getCurrentView() !== view || this.store.isShowingArchive()) {
				this.store.dispatch({ type: 'SWITCH_VIEW', payload: { view } });
			}
		});
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
