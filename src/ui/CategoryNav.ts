import { Menu } from 'obsidian';
import type { App } from 'obsidian';
import type { KanbanStore } from '../store';
import { t } from '../i18n';
import { ConfirmModal } from './ConfirmModal';
import { createInlineInput } from './InlineInput';
import { appendAccessibleLabel } from '../utils/dom';
import { getStableReorderSide, reorderIdsIfChanged, type ReorderSide } from '../utils/reorder';
import type { TaskDrag } from './TaskDrag';
import { ReorderVisual } from './ReorderVisual';

const TRANSIENT_FOCUS_CLASS = 'aulyckanban-add-control-focused';

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
	private focusTargetAfterRender: { kind: 'all' } | { kind: 'column'; id: string } | null = null;
	private readonly drag?: TaskDrag;
	private readonly unsubscribeDrag?: () => void;
	private draggedColumnId: string | null = null;
	private reorderHoverColumnId: string | null = null;
	private reorderHoverSide: ReorderSide | null = null;
	private readonly reorderVisual = new ReorderVisual('vertical');

	constructor(parentEl: HTMLElement, app: App, store: KanbanStore, drag?: TaskDrag) {
		this.app = app;
		this.store = store;
		this.drag = drag;
		this.el = parentEl.createDiv({ cls: 'aulyckanban-category-nav' });
		this.unsubscribeDrag = drag?.subscribe(() => this.updateDragTargets());
		this.render();
	}

	render(): void {
		this.finishColumnReorder();
		this.el.toggleClass(TRANSIENT_FOCUS_CLASS, false);
		this.el.empty();

		const columns = this.store.getCurrentColumns();
		const activeId = this.store.getActiveColumnId();
		const isAllColumns = this.store.isShowingAllColumns();

		const allItemEl = this.el.createDiv({
			cls: `aulyckanban-nav-item aulyckanban-nav-all-btn ${isAllColumns ? 'aulyckanban-nav-item-active' : ''}`,
			attr: { tabindex: '-1', role: 'button', 'aria-pressed': String(isAllColumns) },
		});
		allItemEl.createSpan({ cls: 'aulyckanban-nav-item-title', text: t('column.all') });
		allItemEl.createSpan({
			cls: 'aulyckanban-nav-item-count',
			text: String(this.store.getVisibleTaskCount()),
		});
		const showAllColumns = (event: MouseEvent | KeyboardEvent): void => {
			event.preventDefault();
			event.stopPropagation();
			if (this.store.isShowingAllColumns()) {
				allItemEl.focus({ preventScroll: true });
				return;
			}
			this.focusTargetAfterRender = { kind: 'all' };
			this.store.dispatch({ type: 'SHOW_ALL_COLUMNS' });
		};
		allItemEl.addEventListener('click', showAllColumns);
		allItemEl.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter' || event.key === ' ') showAllColumns(event);
		});

		// 分类列表
		const listEl = this.el.createDiv({ cls: 'aulyckanban-nav-list' });

		for (const column of columns) {
			const isActive = !isAllColumns && column.id === activeId;
			const taskCount = this.store.getTaskCountForColumn(column.id);

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
				this.focusTargetAfterRender = { kind: 'column', id: column.id };
				this.store.dispatch({
					type: 'SELECT_COLUMN',
					payload: { columnId: column.id },
				});
			});
			itemEl.addEventListener('keydown', (e: KeyboardEvent) => {
				if (e.key !== 'Enter' && e.key !== ' ') return;
				e.preventDefault();
				this.focusTargetAfterRender = { kind: 'column', id: column.id };
				this.store.dispatch({ type: 'SELECT_COLUMN', payload: { columnId: column.id } });
			});

			// 右键菜单
			itemEl.addEventListener('contextmenu', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.showColumnMenu(e, column.id, itemEl);
			});
			this.bindDragTarget(itemEl, column.id);
			this.bindColumnReorder(itemEl, column.id, column.title);
		}

		// 添加分类按钮（紧跟在分类列表下方）
		const addBtn = listEl.createDiv({
			cls: 'aulyckanban-nav-add-btn',
			attr: this.isAdding ? {} : { tabindex: '-1', role: 'button' },
		});
		if (this.isAdding) {
			addBtn.addClass('aulyckanban-nav-item-editing');
			const inputEl = createInlineInput(addBtn, {
				cls: 'aulyckanban-nav-inline-input',
				placeholder: t('column.addPrompt'),
				initialValue: this.draftTitle,
				focusOnMount: this.consumeFocusRequest(),
				blurBehavior: 'cancel',
				onInput: (value) => {
					this.draftTitle = value;
				},
				onCommit: (value) => {
					this.draftTitle = value;
					return this.commitAdd();
				},
				onCancel: () => this.cancelEditing(),
			});
			this.bindTransientControlFocus(inputEl);
		} else {
			addBtn.createSpan({
				text: '+',
				cls: 'aulyckanban-nav-add-icon',
				attr: { 'aria-hidden': 'true' },
			});
			appendAccessibleLabel(addBtn, t('column.addPrompt'));
			this.bindTransientControlFocus(addBtn);
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

		this.restoreRequestedFocus(allItemEl, listEl);
		this.updateDragTargets();
	}

	private bindDragTarget(itemEl: HTMLElement, columnId: string): void {
		if (!this.drag) return;
		itemEl.addEventListener('dragenter', (event: DragEvent) => {
			if (!this.drag?.isDragging) return;
			event.preventDefault();
			itemEl.addClass('aulyckanban-drop-hover');
		});
		itemEl.addEventListener('dragover', (event: DragEvent) => {
			if (!this.drag?.isDragging) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		});
		itemEl.addEventListener('dragleave', (event: DragEvent) => {
			const nextTarget = event.relatedTarget;
			const NodeConstructor = itemEl.ownerDocument.defaultView?.Node;
			if (NodeConstructor && nextTarget instanceof NodeConstructor && itemEl.contains(nextTarget)) {
				return;
			}
			itemEl.removeClass('aulyckanban-drop-hover');
		});
		itemEl.addEventListener('drop', (event: DragEvent) => {
			if (!this.drag?.isDragging) return;
			event.preventDefault();
			event.stopPropagation();
			itemEl.removeClass('aulyckanban-drop-hover');
			this.drag.drop({ targetColumnId: columnId });
		});
	}

	private bindColumnReorder(itemEl: HTMLElement, columnId: string, label: string): void {
		itemEl.draggable = true;
		itemEl.addEventListener('dragstart', (event: DragEvent) => {
			this.draggedColumnId = columnId;
			this.reorderVisual.start(itemEl, event, label);
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('application/x-aulyckanban-column-order', columnId);
			}
		});
		itemEl.addEventListener('dragover', (event: DragEvent) => {
			if (!this.draggedColumnId) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			const side = this.getColumnDropSide(itemEl, columnId, event);
			if (!this.getChangedColumnOrder(columnId, side)) {
				this.reorderVisual.clearPlaceholder();
				return;
			}
			this.reorderVisual.show(itemEl, side, () => this.commitColumnReorder(columnId, side));
		});
		itemEl.addEventListener('dragleave', (event: DragEvent) => {
			if (!this.draggedColumnId) return;
			// WebKit 可能在占位槽插入导致布局变化时报告 null，不能据此清除占位槽。
			if (!event.relatedTarget) return;
			if (this.reorderVisual.containsPlaceholder(event.relatedTarget)) return;
			const nextTarget = event.relatedTarget;
			const NodeConstructor = itemEl.ownerDocument.defaultView?.Node;
			if (NodeConstructor && nextTarget instanceof NodeConstructor && itemEl.contains(nextTarget)) {
				return;
			}
			this.reorderVisual.clearPlaceholder();
		});
		itemEl.addEventListener('drop', (event: DragEvent) => {
			if (!this.draggedColumnId) return;
			event.preventDefault();
			event.stopPropagation();
			this.commitColumnReorder(columnId, this.getColumnDropSide(itemEl, columnId, event));
		});
		itemEl.addEventListener('dragend', () => this.finishColumnReorder());
	}

	private getColumnDropSide(itemEl: HTMLElement, columnId: string, event: DragEvent): ReorderSide {
		const rect = itemEl.getBoundingClientRect();
		const previousSide = this.reorderHoverColumnId === columnId ? this.reorderHoverSide : null;
		const side = getStableReorderSide(event.clientY, rect.top, rect.height, previousSide);
		this.reorderHoverColumnId = columnId;
		this.reorderHoverSide = side;
		return side;
	}

	private commitColumnReorder(targetColumnId: string, side: ReorderSide): void {
		const reorderedIds = this.getChangedColumnOrder(targetColumnId, side);
		this.finishColumnReorder();
		if (reorderedIds) {
			this.store.dispatch({ type: 'REORDER_COLUMNS', payload: { columnIds: reorderedIds } });
		}
	}

	private getChangedColumnOrder(targetColumnId: string, side: ReorderSide): string[] | null {
		const draggedColumnId = this.draggedColumnId;
		if (!draggedColumnId) return null;
		return reorderIdsIfChanged(
			this.store.getCurrentColumns().map((column) => column.id),
			draggedColumnId,
			targetColumnId,
			side,
		);
	}

	private finishColumnReorder(): void {
		this.draggedColumnId = null;
		this.reorderHoverColumnId = null;
		this.reorderHoverSide = null;
		this.reorderVisual.finish();
	}

	private updateDragTargets(): void {
		if (!this.drag) return;
		for (const item of Array.from(
			this.el.querySelectorAll<HTMLElement>('.aulyckanban-nav-item[data-column-id]'),
		)) {
			item.toggleClass('aulyckanban-drop-zone', this.drag.isDragging);
			if (!this.drag.isDragging) item.removeClass('aulyckanban-drop-hover');
		}
	}

	destroy(): void {
		this.finishColumnReorder();
		this.unsubscribeDrag?.();
	}

	private restoreRequestedFocus(allItemEl: HTMLElement, listEl: HTMLElement): void {
		const target = this.focusTargetAfterRender;
		if (!target) return;
		this.focusTargetAfterRender = null;
		const targetEl =
			target.kind === 'all'
				? allItemEl
				: Array.from(listEl.querySelectorAll<HTMLElement>('.aulyckanban-nav-item')).find(
						(item) => item.dataset['columnId'] === target.id,
					);
		targetEl?.focus({ preventScroll: true });
	}

	/**
	 * 右键菜单：重命名 / 删除
	 */
	private showColumnMenu(e: MouseEvent, columnId: string, itemEl: HTMLElement): void {
		const menu = new Menu();

		menu.addItem((item) => {
			item
				.setTitle(t('column.rename'))
				.setIcon('pencil')
				.onClick(() => {
					this.startInlineRename(columnId, itemEl);
				});
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item
				.setTitle(t('column.delete'))
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
		itemEl.removeAttribute('tabindex');
		itemEl.removeAttribute('role');
		itemEl.empty();
		const inputEl = createInlineInput(itemEl, {
			cls: 'aulyckanban-nav-inline-input',
			initialValue: this.draftTitle || currentTitle,
			focusOnMount: this.consumeFocusRequest(),
			blurBehavior: 'commit',
			stopClickPropagation: true,
			onInput: (value) => {
				this.draftTitle = value;
			},
			onCommit: (value) => {
				this.draftTitle = value;
				this.commitRename(columnId, currentTitle);
			},
			onCancel: () => this.cancelEditing(),
		});
		this.bindTransientControlFocus(inputEl);
	}

	private bindTransientControlFocus(element: HTMLElement): void {
		const update = (focused: boolean): void => {
			this.el.toggleClass(TRANSIENT_FOCUS_CLASS, focused);
		};
		element.addEventListener('focus', () => update(true));
		element.addEventListener('blur', () => update(false));
		if (this.el.doc.activeElement === element) update(true);
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
			onConfirm: () =>
				this.store.dispatch({
					type: 'DELETE_COLUMN',
					payload: { columnId, moveTasks: true },
				}),
		}).open();
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
