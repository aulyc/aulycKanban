import { App } from 'obsidian';
import type { KanbanStore } from '../store';
import { TaskList } from './TaskList';
import { CategoryNav } from './CategoryNav';
import { Toolbar } from './Toolbar';
import { ArchiveView } from './ArchiveView';

/**
 * 看板面板组件
 * 布局：Toolbar + (左侧 TaskList + 右侧 CategoryNav)
 * 归档模式：Toolbar + ArchiveView
 */
export class Board {
	private containerEl: HTMLElement;
	private store: KanbanStore;
	private app: App;
	private pluginId: string;

	constructor(containerEl: HTMLElement, store: KanbanStore, app: App, pluginId: string) {
		this.containerEl = containerEl;
		this.store = store;
		this.app = app;
		this.pluginId = pluginId;
	}

	render(): void {
		this.containerEl.empty();

		// 工具栏（始终显示）
		new Toolbar(this.containerEl, this.store, this.app, this.pluginId);

		if (this.store.isShowingArchive()) {
			// 归档视图
			const archiveContainer = this.containerEl.createDiv({ cls: 'xaulyc-archive-container' });
			const archiveView = new ArchiveView(archiveContainer, this.store);
			archiveView.render();
		} else {
			// 看板视图：左侧任务列表 + 右侧分类导航
			const contentArea = this.containerEl.createDiv({ cls: 'xaulyc-content-area' });

			const taskList = new TaskList(contentArea, this.store);
			taskList.render();

			new CategoryNav(contentArea, this.store);
		}
	}

	destroy(): void {
		// 无需特殊清理（不再有 dndManager）
	}
}
