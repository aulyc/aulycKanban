import { App, setIcon } from 'obsidian';
import { t } from '../i18n';
import type { KanbanStore } from '../store';
import type { ViewKind } from '../types';

/**
 * 顶部工具栏组件
 * 包含视图切换标签 + 归档按钮 + 设置按钮
 */
export class Toolbar {
	private el: HTMLElement;
	private store: KanbanStore;
	private app: App;
	private pluginId: string;

	constructor(parentEl: HTMLElement, store: KanbanStore, app: App, pluginId: string) {
		this.store = store;
		this.app = app;
		this.pluginId = pluginId;
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

		// 右侧：归档按钮 + 设置按钮
		const rightEl = this.el.createDiv({ cls: 'xaulyc-toolbar-right' });

		// 归档按钮
		const archiveBtn = rightEl.createEl('button', {
			text: isArchive ? '←' : '📦',
			cls: isArchive ? 'xaulyc-archive-btn xaulyc-archive-btn-active' : 'xaulyc-archive-btn',
		});
		archiveBtn.setAttribute('aria-label', t('archive.tooltip'));
		archiveBtn.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
		});

		// 设置按钮
		const settingsBtn = rightEl.createEl('button', {
			cls: 'xaulyc-settings-btn',
		});
		setIcon(settingsBtn, 'settings');
		settingsBtn.setAttribute('aria-label', t('settings.open'));
		settingsBtn.addEventListener('click', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			// 通过 Obsidian 命令打开设置，再延迟跳转到插件 tab
			// 这样设置页由系统管理，不会因插件卸载而关闭
			const appAny = this.app as unknown as Record<string, unknown>;
			const commands = appAny['commands'] as { executeCommandById?: (id: string) => void } | undefined;
			if (commands?.executeCommandById) {
				commands.executeCommandById('app:open-settings');
			}
			// 延迟后跳转到插件设置 tab
			const pluginId = this.pluginId;
			setTimeout(() => {
				const setting = appAny['setting'] as { openTabById?: (id: string) => void } | undefined;
				if (setting?.openTabById) {
					setting.openTabById(pluginId);
				}
			}, 100);
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
