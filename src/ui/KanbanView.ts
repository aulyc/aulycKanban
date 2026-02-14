import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_KANBAN } from '../constants';
import { t } from '../i18n';
import type KanbanPlugin from '../main';
import { Board } from './Board';

/**
 * 看板主视图
 * 作为 Obsidian 标签页 / 侧栏面板展示
 */
export class KanbanView extends ItemView {
	private plugin: KanbanPlugin;
	private board: Board | null = null;
	private unsubscribe: (() => void) | null = null;
	private isClosing = false;
	private tabHandler: ((e: KeyboardEvent) => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: KanbanPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_KANBAN;
	}

	getDisplayText(): string {
		return t('view.displayName');
	}

	getIcon(): string {
		return 'list-todo';
	}

	async onOpen(): Promise<void> {
		this.isClosing = false;

		const container = this.contentEl;
		container.empty();
		container.addClass('xaulyc-kanban-container');
		// 让容器可聚焦，接收键盘事件
		container.setAttribute('tabindex', '0');

		this.board = new Board(container, this.plugin.store, this.app, this.plugin.manifest.id);
		this.board.render();

		// 订阅 store 变化，自动重渲染
		this.unsubscribe = this.plugin.store.subscribe(() => {
			if (this.isClosing || !this.board) return;
			this.board.render();
		});

		// 视图级别监听 Tab 切换分类
		this.tabHandler = (e: KeyboardEvent) => {
			if (e.key === 'Tab') {
				// 如果正在重命名分类（nav-inline-input 聚焦），不拦截
				const active = document.activeElement;
				if (active?.classList.contains('xaulyc-nav-inline-input')) return;

				e.preventDefault();
				e.stopPropagation();
				this.switchToNextCategory();
			}
		};
		container.addEventListener('keydown', this.tabHandler, true);
	}

	async onClose(): Promise<void> {
		this.isClosing = true;

		if (this.tabHandler) {
			this.contentEl.removeEventListener('keydown', this.tabHandler, true);
			this.tabHandler = null;
		}

		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}

		if (this.board) {
			this.board.destroy();
			this.board = null;
		}
	}

	/**
	 * 切换到下一个分类（循环）
	 */
	private switchToNextCategory(): void {
		const store = this.plugin.store;
		if (store.isShowingArchive()) return;

		const columns = store.getCurrentColumns();
		if (columns.length === 0) return;

		const activeId = store.getActiveColumnId();
		const currentIndex = columns.findIndex((c) => c.id === activeId);

		let targetIndex = currentIndex + 1;
		if (targetIndex >= columns.length) targetIndex = 0;

		const targetCol = columns[targetIndex];
		if (targetCol) {
			store.dispatch({
				type: 'SELECT_COLUMN',
				payload: { columnId: targetCol.id },
			});
		}
	}
}
