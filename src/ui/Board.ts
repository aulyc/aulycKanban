import { App } from 'obsidian';
import type { KanbanStore } from '../store';
import { ColumnComponent } from './Column';
import { Toolbar } from './Toolbar';
import { ArchiveView } from './ArchiveView';
import { DragDropManager } from '../features/dnd';

/**
 * 看板面板组件
 * 根据 store 状态切换看板视图 / 归档视图
 */
export class Board {
	private containerEl: HTMLElement;
	private store: KanbanStore;
	private app: App;
	private pluginId: string;
	private toolbar: Toolbar | null = null;
	private columnComponents: ColumnComponent[] = [];
	private dndManager: DragDropManager | null = null;

	constructor(containerEl: HTMLElement, store: KanbanStore, app: App, pluginId: string) {
		this.containerEl = containerEl;
		this.store = store;
		this.app = app;
		this.pluginId = pluginId;
	}

	render(): void {
		if (this.dndManager) {
			this.dndManager.cleanup();
			this.dndManager = null;
		}

		this.containerEl.empty();
		this.columnComponents = [];

		// 工具栏（传入 app 和 pluginId 供设置按钮使用）
		this.toolbar = new Toolbar(this.containerEl, this.store, this.app, this.pluginId);

		if (this.store.isShowingArchive()) {
			const archiveContainer = this.containerEl.createDiv({ cls: 'xaulyc-archive-container' });
			const archiveView = new ArchiveView(archiveContainer, this.store);
			archiveView.render();
		} else {
			this.renderBoard();
		}
	}

	private renderBoard(): void {
		const columnsEl = this.containerEl.createDiv({ cls: 'xaulyc-columns' });
		const columns = this.store.getCurrentColumns();

		for (const columnData of columns) {
			const col = new ColumnComponent(columnsEl, this.store, columnData);
			col.renderTasks();
			this.columnComponents.push(col);
		}

		requestAnimationFrame(() => {
			this.dndManager = new DragDropManager(this.store, columnsEl);
			this.dndManager.setup();
		});
	}

	getTaskContainers(): HTMLElement[] {
		return this.columnComponents.map((col) => col.getTasksEl());
	}

	destroy(): void {
		if (this.dndManager) {
			this.dndManager.cleanup();
			this.dndManager = null;
		}
	}
}
