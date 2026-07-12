import { Menu } from 'obsidian';
import type { App } from 'obsidian';
import type { KanbanStore } from '../store';
import { t } from '../i18n';
import { ConfirmModal } from './ConfirmModal';
import { createInlineInput } from './InlineInput';

/**
 * 右侧分类导航组件
 * 垂直排列分类按钮，底部有添加按钮
 */
export class CategoryNav {
	private readonly el: HTMLElement;
	private readonly app: App;
	private readonly store: KanbanStore;
	private editingColumnId: string | null = null;
	private isAdding = false;
	private draftTitle = '';
	private shouldFocusInput = false;

	constructor(parentEl: HTMLElement, app: App, store: KanbanStore) {
		this.app = app;
		this.store = store;
		this.el = parentEl.createDiv({ cls: 'aulyckanban-category-nav' });
		this.render();
	}

	render(): void {
		this.el.empty();

		const columns = this.store.getCurrentColumns();
		const activeId = this.store.getActiveColumnId();
		const isArchive = this.store.isShowingArchive();

		// 分类列表
		const listEl = this.el.createDiv({ cls: 'aulyckanban-nav-list' });

		for (const column of columns) {
			const isActive = column.id === activeId;
			const taskCount = isArchive
				? this.store.getArchiveTaskCount(column.id)
				: column.tasks?.length ?? 0;

			const itemEl = listEl.createDiv({
				cls: `aulyckanban-nav-item ${isActive ? 'aulyckanban-nav-item-active' : ''}`,
				attr: { tabindex: '-1', role: 'button' },
			});
			itemEl.dataset['columnId'] = column.id;

			if (this.editingColumnId === column.id) {
				this.renderInlineEditor(itemEl, column.id, column.title);
				continue;
			}

			// 标题
			const titleEl = itemEl.createSpan({ cls: 'aulyckanban-nav-item-title' });
			titleEl.setText(column.title);

			// 任务数
			const countEl = itemEl.createSpan({ cls: 'aulyckanban-nav-item-count' });
			countEl.setText(String(taskCount));

			// 点击选中（编辑态时不触发）
			itemEl.addEventListener('click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				// 如果正在编辑（有输入框），不切换分类
				if (itemEl.classList.contains('aulyckanban-nav-item-editing')) return;
				this.store.dispatch({
					type: 'SELECT_COLUMN',
					payload: { columnId: column.id },
				});
			});
			itemEl.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key !== 'Enter' && e.key !== ' ') return;
				e.preventDefault();
				this.store.dispatch({ type: 'SELECT_COLUMN', payload: { columnId: column.id } });
			});

			// 右键菜单
			itemEl.addEventListener('contextmenu', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.showColumnMenu(e, column.id, itemEl);
			});
		}

		// 添加分类按钮（紧跟在分类列表下方）
		const addBtn = listEl.createDiv({
			cls: 'aulyckanban-nav-add-btn',
			attr: { tabindex: '-1', role: 'button', 'aria-label': t('column.addPrompt') },
		});
		if (this.isAdding) {
			addBtn.addClass('aulyckanban-nav-item-editing');
			createInlineInput(addBtn, {
				cls: 'aulyckanban-nav-inline-input',
				placeholder: t('column.addPrompt'),
				initialValue: this.draftTitle,
				focusOnMount: this.consumeFocusRequest(),
				blurBehavior: 'cancel',
				onInput: (value) => { this.draftTitle = value; },
				onCommit: (value) => {
					this.draftTitle = value;
					return this.commitAdd();
				},
				onCancel: () => this.cancelEditing(),
			});
		} else {
			addBtn.createSpan({ text: '+', cls: 'aulyckanban-nav-add-icon' });
			addBtn.addEventListener('click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.startInlineAdd();
			});
			addBtn.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key !== 'Enter' && e.key !== ' ') return;
				e.preventDefault();
				e.stopPropagation();
				this.startInlineAdd();
			});
		}
	}

	/**
	 * 右键菜单：重命名 / 删除
	 */
	private showColumnMenu(e: MouseEvent, columnId: string, itemEl: HTMLElement): void {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle(t('column.rename'))
				.setIcon('pencil')
				.onClick(() => {
					this.startInlineRename(columnId, itemEl);
				});
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item.setTitle(t('column.delete'))
				.setIcon('trash')
				.onClick(() => {
					this.handleDeleteColumn(columnId);
				});
		});

		menu.showAtMouseEvent(e);
	}

	/**
	 * 内联重命名：整个 nav-item 变为输入框
	 */
	private startInlineRename(columnId: string, itemEl: HTMLElement): void {
		const titleEl = itemEl.querySelector('.aulyckanban-nav-item-title');
		const currentTitle = titleEl?.textContent ?? '';
		this.editingColumnId = columnId;
		this.isAdding = false;
		this.draftTitle = currentTitle;
		this.shouldFocusInput = true;
		this.render();
	}

	/**
	 * 内联添加分类：按钮本身变为输入框
	 */
	private startInlineAdd(): void {
		this.isAdding = true;
		this.editingColumnId = null;
		this.draftTitle = '';
		this.shouldFocusInput = true;
		this.render();
	}

	private renderInlineEditor(itemEl: HTMLElement, columnId: string, currentTitle: string): void {
		itemEl.addClass('aulyckanban-nav-item-editing');
		itemEl.empty();
		createInlineInput(itemEl, {
			cls: 'aulyckanban-nav-inline-input',
			initialValue: this.draftTitle || currentTitle,
			focusOnMount: this.consumeFocusRequest(),
			blurBehavior: 'commit',
			stopClickPropagation: true,
			onInput: (value) => { this.draftTitle = value; },
			onCommit: (value) => {
				this.draftTitle = value;
				this.commitRename(columnId, currentTitle);
			},
			onCancel: () => this.cancelEditing(),
		});
	}

	private commitRename(columnId: string, currentTitle: string): void {
		const newTitle = this.draftTitle.trim();
		this.cancelEditing();
		if (newTitle && newTitle !== currentTitle) {
			this.store.dispatch({
				type: 'RENAME_COLUMN',
				payload: { columnId, title: newTitle },
			});
		}
	}

	private commitAdd(): boolean {
		const title = this.draftTitle.trim();
		if (!title) return false;

		// 不在派发前主动 render：移除输入框会同步触发 blur/cancel，造成提交竞争。
		// Store 更新会统一重渲染看板。
		this.editingColumnId = null;
		this.isAdding = false;
		this.draftTitle = '';
		this.shouldFocusInput = false;
		this.store.dispatch({
			type: 'ADD_COLUMN',
			payload: { title },
		});
		return true;
	}

	private cancelEditing(): void {
		this.editingColumnId = null;
		this.isAdding = false;
		this.draftTitle = '';
		this.shouldFocusInput = false;
		this.render();
	}

	/** 读取并清除一次性聚焦标记：仅在刚进入编辑态的那次渲染聚焦输入框 */
	private consumeFocusRequest(): boolean {
		const shouldFocus = this.shouldFocusInput;
		this.shouldFocusInput = false;
		return shouldFocus;
	}

	/**
	 * 删除分类确认
	 */
	private handleDeleteColumn(columnId: string): void {
		const columns = this.store.getCurrentColumns();
		if (columns.length <= 1) return;

		const column = columns.find((c) => c.id === columnId);
		if (!column) return;

		const taskCount = column.tasks?.length ?? 0;
		let msg = t('column.deleteConfirm');
		if (taskCount > 0) {
			msg += '\n' + t('column.deleteMoveTasks');
		}

		new ConfirmModal(this.app, {
			message: msg,
			isDestructive: true,
			onConfirm: () => this.store.dispatch({
				type: 'DELETE_COLUMN',
				payload: { columnId, moveTasks: true },
			}),
		}).open();
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
