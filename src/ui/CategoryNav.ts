import { Menu } from 'obsidian';
import type { KanbanStore } from '../store';
import { t } from '../i18n';

/**
 * 右侧分类导航组件
 * 垂直排列分类按钮，底部有添加按钮
 */
export class CategoryNav {
	private readonly el: HTMLElement;
	private readonly store: KanbanStore;
	private editingColumnId: string | null = null;
	private isAdding = false;
	private draftTitle = '';
	private shouldFocusInput = false;

	constructor(parentEl: HTMLElement, store: KanbanStore) {
		this.store = store;
		this.el = parentEl.createDiv({ cls: 'xaulyc-category-nav' });
		this.render();
	}

	render(): void {
		this.el.empty();

		const columns = this.store.getCurrentColumns();
		const activeId = this.store.getActiveColumnId();

		// 分类列表
		const listEl = this.el.createDiv({ cls: 'xaulyc-nav-list' });

		for (const column of columns) {
			const isActive = column.id === activeId;
			const taskCount = column.tasks?.length ?? 0;

			const itemEl = listEl.createDiv({
				cls: `xaulyc-nav-item ${isActive ? 'xaulyc-nav-item-active' : ''}`,
			});
			itemEl.dataset['columnId'] = column.id;

			if (this.editingColumnId === column.id) {
				this.renderInlineEditor(itemEl, column.id, column.title);
				continue;
			}

			// 标题
			const titleEl = itemEl.createSpan({ cls: 'xaulyc-nav-item-title' });
			titleEl.setText(column.title);

			// 任务数
			const countEl = itemEl.createSpan({ cls: 'xaulyc-nav-item-count' });
			countEl.setText(String(taskCount));

			// 点击选中（编辑态时不触发）
			itemEl.addEventListener('click', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				// 如果正在编辑（有输入框），不切换分类
				if (itemEl.classList.contains('xaulyc-nav-item-editing')) return;
				this.store.dispatch({
					type: 'SELECT_COLUMN',
					payload: { columnId: column.id },
				});
			});

			// 右键菜单
			itemEl.addEventListener('contextmenu', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.showColumnMenu(e, column.id, itemEl);
			});
		}

		// 添加分类按钮（紧跟在分类列表下方）
		const addBtn = listEl.createDiv({ cls: 'xaulyc-nav-add-btn' });
		if (this.isAdding) {
			addBtn.addClass('xaulyc-nav-item-editing');
			const input = addBtn.createEl('input', {
				cls: 'xaulyc-nav-inline-input',
				attr: { type: 'text', placeholder: t('column.addPrompt') },
			});
			input.value = this.draftTitle;
			input.addEventListener('input', () => {
				this.draftTitle = input.value;
			});
			input.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					e.stopPropagation();
					this.commitAdd();
				}
				if (e.key === 'Escape') {
					e.preventDefault();
					this.cancelEditing();
				}
			});
			input.addEventListener('blur', () => {
				this.commitAdd();
			});
			this.focusInput(input);
		} else {
			addBtn.createSpan({ text: '+', cls: 'xaulyc-nav-add-icon' });
			addBtn.addEventListener('click', (e: MouseEvent) => {
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
		const titleEl = itemEl.querySelector('.xaulyc-nav-item-title');
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
		itemEl.addClass('xaulyc-nav-item-editing');
		itemEl.empty();
		const input = itemEl.createEl('input', {
			cls: 'xaulyc-nav-inline-input',
			attr: { type: 'text' },
		});
		input.value = this.draftTitle || currentTitle;
		input.addEventListener('input', () => {
			this.draftTitle = input.value;
		});
		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				e.stopPropagation();
				this.commitRename(columnId, currentTitle);
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				this.cancelEditing();
			}
		});
		input.addEventListener('blur', () => {
			this.commitRename(columnId, currentTitle);
		});
		input.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
		});
		this.focusInput(input);
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

	private commitAdd(): void {
		const title = this.draftTitle.trim();
		this.cancelEditing();
		if (title) {
			this.store.dispatch({
				type: 'ADD_COLUMN',
				payload: { title },
			});
		}
	}

	private cancelEditing(): void {
		this.editingColumnId = null;
		this.isAdding = false;
		this.draftTitle = '';
		this.shouldFocusInput = false;
		this.render();
	}

	private focusInput(input: HTMLInputElement): void {
		if (!this.shouldFocusInput) return;
		this.shouldFocusInput = false;
		requestAnimationFrame(() => {
			input.focus();
			const len = input.value.length;
			input.setSelectionRange(len, len);
		});
	}

	/**
	 * 删除分类确认（两次点击）
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

		if (confirm(msg)) {
			this.store.dispatch({
				type: 'DELETE_COLUMN',
				payload: { columnId, moveTasks: true },
			});
		}
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
