import type { App } from 'obsidian';
import type { KanbanStore } from '../store';
import { TaskList } from './TaskList';
import { CategoryNav } from './CategoryNav';
import { Toolbar } from './Toolbar';
import { ArchiveView } from './ArchiveView';

/**
 * 看板面板组件
 * 布局：Toolbar + (左侧 TaskList + 右侧 CategoryNav)
 * 归档模式：Toolbar + (左侧 ArchiveView + 右侧 CategoryNav)
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

	constructor(containerEl: HTMLElement, app: App, store: KanbanStore) {
		this.containerEl = containerEl;
		this.store = store;

		// 工具栏（始终显示）
		this.toolbar = new Toolbar(this.containerEl, this.store);
		this.toolbar.getEl();

		// 看板视图容器（左侧任务列表 + 右侧分类导航）
		this.contentAreaEl = this.containerEl.createDiv({ cls: 'aulyckanban-content-area' });
		this.taskList = new TaskList(this.contentAreaEl, app, this.store);

		// 归档与普通任务列表共用左侧网格区域
		this.archiveContainerEl = this.contentAreaEl.createDiv({ cls: 'aulyckanban-archive-container' });
		this.archiveContainerEl.setAttribute('tabindex', '-1');
		this.archiveView = new ArchiveView(this.archiveContainerEl, app, this.store);

		this.categoryNav = new CategoryNav(this.contentAreaEl, app, this.store);
	}

	render(): void {
		this.toolbar.render();

		const isArchive = this.store.isShowingArchive();
		// 归档/看板显隐由 .aulyckanban-mode-archive 对应的 CSS 规则控制
		this.contentAreaEl.toggleClass('aulyckanban-mode-archive', isArchive);
		if (isArchive) this.archiveView.render();
		else this.taskList.render();
		this.categoryNav.render();
	}

	destroy(): void {
		this.containerEl.empty();
	}
}
