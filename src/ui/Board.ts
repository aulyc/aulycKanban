import type { App } from 'obsidian';
import type { KanbanStore } from '../store';
import { TaskList } from './TaskList';
import { CategoryNav } from './CategoryNav';
import { Toolbar } from './Toolbar';
import { ArchiveView } from './ArchiveView';
import { TaskControls } from './TaskControls';
import { UtilityBar } from './UtilityBar';
import { TaskDrag } from './TaskDrag';

/**
 * 看板面板组件
 * 布局：UtilityBar + Toolbar + (左侧 TaskControls + TaskList + 右侧 CategoryNav) + Footer
 * 归档模式：工具区保留共享搜索，将普通任务列表切换为 ArchiveView。
 */
export class Board {
	private readonly containerEl: HTMLElement;
	private readonly store: KanbanStore;
	private readonly utilityBar: UtilityBar;
	private readonly toolbar: Toolbar;
	private readonly contentAreaEl: HTMLElement;
	private readonly taskPaneEl: HTMLElement;
	private readonly taskHeaderEl: HTMLElement;
	private readonly taskControls: TaskControls;
	private readonly taskSelectionControlsEl: HTMLElement;
	private readonly archiveContainerEl: HTMLElement;
	private readonly taskList: TaskList;
	private readonly categoryNav: CategoryNav;
	private readonly archiveView: ArchiveView;
	private readonly footerEl: HTMLElement;
	private readonly footerStatusEl: HTMLElement;
	private readonly drag = new TaskDrag();

	constructor(containerEl: HTMLElement, app: App, store: KanbanStore) {
		this.containerEl = containerEl;
		this.store = store;

		// 搜索与归档工具区（始终显示）
		this.utilityBar = new UtilityBar(this.containerEl, this.store);
		this.utilityBar.getEl();

		// 任务类型栏（始终显示）
		this.toolbar = new Toolbar(this.containerEl, app, this.store, this.drag);
		this.toolbar.getEl();

		// 看板视图容器（左侧任务列表 + 右侧分类导航）
		this.contentAreaEl = this.containerEl.createDiv({ cls: 'aulyckanban-content-area' });
		this.taskPaneEl = this.contentAreaEl.createDiv({ cls: 'aulyckanban-task-pane' });
		this.taskHeaderEl = this.taskPaneEl.createDiv({ cls: 'aulyckanban-task-header' });
		this.taskControls = new TaskControls(this.taskHeaderEl, app, this.store);
		this.taskSelectionControlsEl = this.taskHeaderEl.createDiv({
			cls: 'aulyckanban-task-selection-controls',
		});
		this.taskList = new TaskList(
			this.taskPaneEl,
			app,
			this.store,
			this.drag,
			this.taskSelectionControlsEl,
		);

		// 归档与普通任务列表共用左侧网格区域
		this.archiveContainerEl = this.taskPaneEl.createDiv({
			cls: 'aulyckanban-archive-container',
		});
		this.archiveView = new ArchiveView(this.archiveContainerEl, app, this.store);

		this.categoryNav = new CategoryNav(this.contentAreaEl, app, this.store, this.drag);

		// 固定底部提示区：当前承载多选数量，后续可继续添加同步、筛选等状态提示。
		this.footerEl = this.containerEl.createDiv({ cls: 'aulyckanban-board-footer' });
		this.footerStatusEl = this.footerEl.createDiv({
			cls: 'aulyckanban-board-footer-status',
			attr: { role: 'status', 'aria-live': 'polite' },
		});
		this.taskList.setStatusEl(this.footerStatusEl);
	}

	render(): void {
		this.utilityBar.render();
		this.toolbar.render();
		this.taskControls.render();

		const isArchive = this.store.isShowingArchive();
		// 归档/看板显隐由 .aulyckanban-mode-archive 对应的 CSS 规则控制
		this.taskPaneEl.toggleClass('aulyckanban-mode-archive', isArchive);
		if (isArchive) {
			this.footerStatusEl.empty();
			this.archiveView.render();
		} else this.taskList.render();
		this.categoryNav.render();
	}

	destroy(): void {
		this.toolbar.destroy?.();
		this.categoryNav.destroy?.();
		this.drag.cancel();
		this.containerEl.empty();
	}
}
