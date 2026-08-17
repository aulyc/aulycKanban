import { t } from '../i18n';
import type { KanbanStore } from '../store';
import type { ViewKind } from '../types';
import { createInlineInput } from './InlineInput';
import { ConfirmModal } from './ConfirmModal';
import { revealTaskTypeItem } from '../utils/focusCycle';
import { appendAccessibleLabel } from '../utils/dom';
import { getReorderSide, reorderIdsIfChanged, type ReorderSide } from '../utils/reorder';
import { Menu, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { TaskDrag } from './TaskDrag';
import { ReorderVisual } from './ReorderVisual';

const TRANSIENT_FOCUS_CLASS = 'aulyckanban-add-control-focused';

/** 任务类型栏：固定全部任务 + 可滚动任务类型 + 固定新增入口。 */
export class Toolbar {
	private readonly el: HTMLElement;
	private readonly app: App;
	private readonly store: KanbanStore;
	private editingViewId: ViewKind | null = null;
	private isAdding = false;
	private draftTitle = '';
	private shouldFocusInput = false;
	private readonly drag?: TaskDrag;
	private readonly unsubscribeDrag?: () => void;
	private pendingViewLock: number | null = null;
	private draggedViewId: ViewKind | null = null;
	private readonly reorderVisual = new ReorderVisual('horizontal');

	constructor(parentEl: HTMLElement, app: App, store: KanbanStore, drag?: TaskDrag) {
		this.app = app;
		this.store = store;
		this.drag = drag;
		this.el = parentEl.createDiv({ cls: 'aulyckanban-toolbar' });
		this.unsubscribeDrag = drag?.subscribe(() => this.updateDragTargets());
		this.render();
	}

	render(): void {
		this.finishViewReorder();
		const ownerWindow = this.el.ownerDocument.defaultView;
		const activeElement = this.el.ownerDocument.activeElement;
		const focusedEl =
			ownerWindow && activeElement instanceof ownerWindow.HTMLElement ? activeElement : null;
		const restoreSelectedFocus =
			!!focusedEl &&
			this.el.contains(focusedEl) &&
			(focusedEl.classList.contains('aulyckanban-view-tab') ||
				focusedEl.classList.contains('aulyckanban-all-tasks-btn'));

		this.el.toggleClass(TRANSIENT_FOCUS_CLASS, false);
		this.el.empty();
		const currentView = this.store.getCurrentView();
		const isAllTasks = this.store.isShowingAllTasks();
		const leftEl = this.el.createDiv({ cls: 'aulyckanban-toolbar-left' });
		const allSlotEl = leftEl.createDiv({ cls: 'aulyckanban-all-tasks-slot' });
		const allBtn = allSlotEl.createEl('button', {
			cls: isAllTasks
				? 'aulyckanban-tab aulyckanban-all-tasks-btn aulyckanban-tab-active'
				: 'aulyckanban-tab aulyckanban-all-tasks-btn',
			attr: {
				type: 'button',
				tabindex: '-1',
				'aria-selected': String(isAllTasks),
			},
		});
		setIcon(allBtn, 'list-todo');
		appendAccessibleLabel(allBtn, t('view.all'));
		allBtn.addEventListener('click', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			if (!this.store.isShowingAllTasks() || this.store.isShowingArchive()) {
				this.store.dispatch({ type: 'SHOW_ALL_TASKS' });
			}
		});
		const viewStripEl = leftEl.createDiv({ cls: 'aulyckanban-view-strip' });
		let selectedViewButton: HTMLButtonElement | null = null;

		for (const view of this.store.getTaskViews()) {
			if (this.editingViewId === view.id) {
				this.renderRenameInput(viewStripEl, view.id, view.title);
				continue;
			}
			const isActive = currentView === view.id && !isAllTasks;
			const button = this.createTab(viewStripEl, view.id, view.title, isActive);
			if (isActive) selectedViewButton = button;
		}

		const addSlotEl = leftEl.createDiv({ cls: 'aulyckanban-view-add-slot' });
		if (this.isAdding) this.renderAddInput(addSlotEl);
		else {
			const addBtn = addSlotEl.createEl('button', {
				cls: 'aulyckanban-tab aulyckanban-view-add-btn',
				attr: { type: 'button', tabindex: '-1' },
			});
			addBtn.createSpan({ text: '+', attr: { 'aria-hidden': 'true' } });
			appendAccessibleLabel(addBtn, t('view.add'));
			this.bindTransientControlFocus(addBtn);
			addBtn.addEventListener('click', (event: MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();
				this.editingViewId = null;
				this.isAdding = true;
				this.draftTitle = '';
				this.shouldFocusInput = false;
				this.render();
			});
		}

		if (restoreSelectedFocus) {
			const target = isAllTasks ? allBtn : selectedViewButton;
			target?.focus({ preventScroll: true });
			if (target) revealTaskTypeItem(target);
		}
		this.updateDragTargets();
	}

	private renderAddInput(parentEl: HTMLElement): void {
		const inputEl = createInlineInput(parentEl, {
			cls: 'aulyckanban-view-inline-input aulyckanban-view-add-input',
			placeholder: t('view.addPrompt'),
			initialValue: this.draftTitle,
			focusOnMount: true,
			blurBehavior: 'cancel',
			onInput: (value) => {
				this.draftTitle = value;
			},
			onCommit: (value) => {
				const title = value.trim();
				if (!title) return false;
				this.isAdding = false;
				this.draftTitle = '';
				this.store.dispatch({ type: 'ADD_VIEW', payload: { title } });
				return true;
			},
			onCancel: () => this.cancelAdd(),
		});
		this.bindTransientControlFocus(inputEl);
		inputEl.win.requestAnimationFrame(() => revealTaskTypeItem(inputEl));
	}

	private renderRenameInput(parentEl: HTMLElement, viewId: ViewKind, currentTitle: string): void {
		const inputEl = createInlineInput(parentEl, {
			cls: 'aulyckanban-view-inline-input aulyckanban-view-rename-input',
			initialValue: this.draftTitle || currentTitle,
			focusOnMount: this.consumeFocusRequest(),
			blurBehavior: 'commit',
			onInput: (value) => {
				this.draftTitle = value;
			},
			onCommit: (value) => {
				const title = value.trim();
				if (!title) return false;
				this.editingViewId = null;
				this.draftTitle = '';
				this.shouldFocusInput = false;
				if (title === currentTitle) this.render();
				else this.store.dispatch({ type: 'RENAME_VIEW', payload: { viewId, title } });
				return true;
			},
			onCancel: () => this.cancelRename(),
		});
		this.bindTransientControlFocus(inputEl);
		inputEl.win.requestAnimationFrame(() => revealTaskTypeItem(inputEl));
	}

	private cancelAdd(): void {
		if (!this.isAdding) return;
		this.isAdding = false;
		this.draftTitle = '';
		this.shouldFocusInput = false;
		this.render();
	}

	private cancelRename(): void {
		if (this.editingViewId === null) return;
		this.editingViewId = null;
		this.draftTitle = '';
		this.shouldFocusInput = false;
		this.render();
	}

	private createTab(
		parentEl: HTMLElement,
		view: ViewKind,
		label: string,
		isActive: boolean,
	): HTMLButtonElement {
		const button = parentEl.createEl('button', {
			text: label,
			cls: isActive
				? 'aulyckanban-tab aulyckanban-view-tab aulyckanban-tab-active'
				: 'aulyckanban-tab aulyckanban-view-tab',
			attr: { type: 'button', tabindex: '-1' },
		});
		button.dataset['viewId'] = view;
		button.setAttribute('aria-selected', String(isActive));
		button.addEventListener('click', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			if (
				this.store.getCurrentView() !== view ||
				this.store.isShowingArchive() ||
				this.store.isShowingAllTasks()
			) {
				this.store.dispatch({ type: 'SWITCH_VIEW', payload: { view } });
			}
		});
		button.addEventListener('contextmenu', (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			this.showViewMenu(event, view, label);
		});
		button.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
			event.preventDefault();
			event.stopPropagation();
			const rect = button.getBoundingClientRect();
			const MouseEventConstructor = button.ownerDocument.defaultView?.MouseEvent ?? MouseEvent;
			this.showViewMenu(
				new MouseEventConstructor('contextmenu', {
					clientX: rect.left + rect.width / 2,
					clientY: rect.bottom,
				}),
				view,
				label,
			);
		});
		this.bindDragTarget(button, view);
		this.bindViewReorder(button, view, label);
		return button;
	}

	private bindViewReorder(button: HTMLButtonElement, viewId: ViewKind, label: string): void {
		button.draggable = true;
		button.addEventListener('dragstart', (event: DragEvent) => {
			this.clearPendingViewLock();
			this.draggedViewId = viewId;
			this.reorderVisual.start(button, event, label);
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move';
				event.dataTransfer.setData('application/x-aulyckanban-view-order', viewId);
			}
		});
		button.addEventListener('dragover', (event: DragEvent) => {
			if (!this.draggedViewId) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
			const side = this.getViewDropSide(button, event);
			if (!this.getChangedViewOrder(viewId, side)) {
				this.reorderVisual.clearPlaceholder();
				return;
			}
			this.reorderVisual.show(button, side, () => this.commitViewReorder(viewId, side));
		});
		button.addEventListener('dragleave', (event: DragEvent) => {
			if (!this.draggedViewId) return;
			// WebKit 可能在占位槽插入导致布局变化时报告 null，不能据此清除占位槽。
			if (!event.relatedTarget) return;
			if (this.reorderVisual.containsPlaceholder(event.relatedTarget)) return;
			const nextTarget = event.relatedTarget;
			const NodeConstructor = button.ownerDocument.defaultView?.Node;
			if (NodeConstructor && nextTarget instanceof NodeConstructor && button.contains(nextTarget)) {
				return;
			}
			this.reorderVisual.clearPlaceholder();
		});
		button.addEventListener('drop', (event: DragEvent) => {
			if (!this.draggedViewId) return;
			event.preventDefault();
			event.stopPropagation();
			this.commitViewReorder(viewId, this.getViewDropSide(button, event));
		});
		button.addEventListener('dragend', () => this.finishViewReorder());
	}

	private getViewDropSide(button: HTMLElement, event: DragEvent): ReorderSide {
		const rect = button.getBoundingClientRect();
		return getReorderSide(event.clientX, rect.left, rect.width);
	}

	private commitViewReorder(targetViewId: ViewKind, side: ReorderSide): void {
		const reorderedIds = this.getChangedViewOrder(targetViewId, side);
		this.finishViewReorder();
		if (reorderedIds) {
			this.store.dispatch({ type: 'REORDER_VIEWS', payload: { viewIds: reorderedIds } });
		}
	}

	private getChangedViewOrder(targetViewId: ViewKind, side: ReorderSide): string[] | null {
		const draggedViewId = this.draggedViewId;
		if (!draggedViewId) return null;
		return reorderIdsIfChanged(
			this.store.getTaskViews().map((view) => view.id),
			draggedViewId,
			targetViewId,
			side,
		);
	}

	private finishViewReorder(): void {
		this.draggedViewId = null;
		this.reorderVisual.finish();
	}

	private bindDragTarget(button: HTMLButtonElement, viewId: ViewKind): void {
		if (!this.drag) return;
		button.addEventListener('dragenter', (event: DragEvent) => {
			if (!this.drag?.isDragging) return;
			event.preventDefault();
			button.addClass('aulyckanban-drop-hover');
			this.clearPendingViewLock();
			this.pendingViewLock = button.win.setTimeout(() => {
				this.pendingViewLock = null;
				this.drag?.lockView(viewId);
			}, 500);
		});
		button.addEventListener('dragover', (event: DragEvent) => {
			if (!this.drag?.isDragging) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
		});
		button.addEventListener('dragleave', (event: DragEvent) => {
			const nextTarget = event.relatedTarget;
			const NodeConstructor = button.ownerDocument.defaultView?.Node;
			if (NodeConstructor && nextTarget instanceof NodeConstructor && button.contains(nextTarget)) {
				return;
			}
			button.removeClass('aulyckanban-drop-hover');
			this.clearPendingViewLock();
		});
		button.addEventListener('drop', (event: DragEvent) => {
			if (!this.drag?.isDragging) return;
			event.preventDefault();
			event.stopPropagation();
			button.removeClass('aulyckanban-drop-hover');
			this.clearPendingViewLock();
			this.drag.drop({ targetViewId: viewId });
		});
	}

	private updateDragTargets(): void {
		if (!this.drag) return;
		for (const button of Array.from(
			this.el.querySelectorAll<HTMLElement>('.aulyckanban-view-tab'),
		)) {
			button.toggleClass('aulyckanban-drop-zone', this.drag.isDragging);
			button.toggleClass(
				'aulyckanban-drop-locked',
				this.drag.isDragging && button.dataset['viewId'] === this.drag.lockedViewId,
			);
			if (!this.drag.isDragging) button.removeClass('aulyckanban-drop-hover');
		}
	}

	private clearPendingViewLock(): void {
		if (this.pendingViewLock === null) return;
		this.el.win.clearTimeout(this.pendingViewLock);
		this.pendingViewLock = null;
	}

	destroy(): void {
		this.clearPendingViewLock();
		this.finishViewReorder();
		this.unsubscribeDrag?.();
	}

	private bindTransientControlFocus(element: HTMLElement): void {
		const update = (focused: boolean): void => {
			this.el.toggleClass(TRANSIENT_FOCUS_CLASS, focused);
		};
		element.addEventListener('focus', () => update(true));
		element.addEventListener('blur', () => update(false));
		if (this.el.doc.activeElement === element) update(true);
	}

	private showViewMenu(event: MouseEvent, viewId: ViewKind, currentTitle: string): void {
		const menu = new Menu();
		menu.addItem((item) => {
			item
				.setTitle(t('view.rename'))
				.setIcon('pencil')
				.onClick(() => this.startRename(viewId, currentTitle));
		});
		menu.addSeparator();
		menu.addItem((item) => {
			item
				.setTitle(t('view.delete'))
				.setIcon('trash')
				.setDisabled(this.store.getTaskViews().length <= 1)
				.onClick(() => this.confirmDelete(viewId));
		});
		menu.showAtMouseEvent(event);
	}

	private startRename(viewId: ViewKind, currentTitle: string): void {
		this.editingViewId = viewId;
		this.isAdding = false;
		this.draftTitle = currentTitle;
		this.shouldFocusInput = true;
		this.render();
	}

	private confirmDelete(viewId: ViewKind): void {
		if (this.store.getTaskViews().length <= 1) return;
		const view = this.store.getView(viewId);
		if (!view) return;
		const taskCount = view.columns.reduce((count, column) => count + column.tasks.length, 0);
		const archiveCount = this.store.getArchive(viewId).length;
		const message = `${t('view.deleteConfirm').replace('{title}', view.title)}\n${t(
			'view.deleteData',
		)
			.replace('{taskCount}', String(taskCount))
			.replace('{archiveCount}', String(archiveCount))}`;
		new ConfirmModal(this.app, {
			message,
			isDestructive: true,
			onConfirm: () => this.store.dispatch({ type: 'DELETE_VIEW', payload: { viewId } }),
		}).open();
	}

	private consumeFocusRequest(): boolean {
		const shouldFocus = this.shouldFocusInput;
		this.shouldFocusInput = false;
		return shouldFocus;
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
