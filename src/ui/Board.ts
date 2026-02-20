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
	private readonly containerEl: HTMLElement;
	private readonly store: KanbanStore;
	private readonly toolbar: Toolbar;
	private readonly contentAreaEl: HTMLElement;
	private readonly archiveContainerEl: HTMLElement;
	private readonly taskList: TaskList;
	private readonly categoryNav: CategoryNav;
	private readonly archiveView: ArchiveView;

	constructor(containerEl: HTMLElement, store: KanbanStore) {
		this.containerEl = containerEl;
		this.store = store;

		// 工具栏（始终显示）
		this.toolbar = new Toolbar(this.containerEl, this.store);
		this.toolbar.getEl();

		// 看板视图容器（左侧任务列表 + 右侧分类导航）
		this.contentAreaEl = this.containerEl.createDiv({ cls: 'xaulyc-content-area' });
		this.taskList = new TaskList(this.contentAreaEl, this.store);
		this.categoryNav = new CategoryNav(this.contentAreaEl, this.store);

		// 归档视图容器
		this.archiveContainerEl = this.containerEl.createDiv({ cls: 'xaulyc-archive-container' });
		this.archiveView = new ArchiveView(this.archiveContainerEl, this.store);
	}

	render(): void {
		this.toolbar.render();

		if (this.store.isShowingArchive()) {
			this.contentAreaEl.style.display = 'none';
			this.archiveContainerEl.style.display = '';
			this.archiveView.render();
			return;
		}

		this.archiveContainerEl.style.display = 'none';
		this.contentAreaEl.style.display = '';
		this.taskList.render();
		this.categoryNav.render();
	}

	destroy(): void {
		this.containerEl.empty();
	}
}
