import { setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { Task } from '../types';
import type { KanbanStore } from '../store';
import { t } from '../i18n';
import { formatDateTimeMinute } from '../utils/datetime';
import { setTextWithLineBreaks } from '../utils/dom';
import { ConfirmModal } from './ConfirmModal';
import { createInlineInput } from './InlineInput';
import { createTaskCardMeta } from './TaskCardMeta';

export interface TaskCardOptions {
	selectionMode?: boolean;
	selected?: boolean;
	onSelectionRequest?: (event: MouseEvent | KeyboardEvent) => void;
	onContextMenu?: (event: MouseEvent) => void;
	onDragStart?: (event: DragEvent) => number;
	onDragEnd?: (event: DragEvent) => void;
}

/**
 * 任务卡片组件
 * - 单击选中卡片，双击任务内容或按 Enter 进入编辑模式（inline textarea）
 * - 删除按钮两次点击确认（第一次变色，第二次删除）
 * - 显示创建/修改时间
 */
export class TaskCard {
	private readonly el: HTMLElement;
	private readonly app: App;
	private readonly store: KanbanStore;
	private readonly viewId: string;
	private readonly columnId: string;
	private readonly task: Task;
	private readonly sourceLabel?: string;
	private readonly options: TaskCardOptions;

	constructor(
		parentEl: HTMLElement,
		app: App,
		store: KanbanStore,
		viewId: string,
		columnId: string,
		task: Task,
		sourceLabel?: string,
		options: TaskCardOptions = {},
	) {
		this.app = app;
		this.store = store;
		this.viewId = viewId;
		this.columnId = columnId;
		this.task = task;
		this.sourceLabel = sourceLabel;
		this.options = options;

		this.el = parentEl.createDiv({
			cls: [
				'aulyckanban-task',
				task.completed ? 'aulyckanban-task-completed' : '',
				options.selectionMode ? 'aulyckanban-task-selecting' : '',
				options.selected ? 'aulyckanban-task-selected' : '',
			]
				.filter(Boolean)
				.join(' '),
		});
		this.el.tabIndex = -1;
		this.el.setAttribute('role', 'button');
		this.el.dataset['viewId'] = viewId;
		this.el.dataset['taskId'] = task.id;
		this.el.dataset['columnId'] = columnId;
		if (options.selectionMode) {
			this.el.setAttribute('role', 'checkbox');
			this.el.setAttribute('aria-checked', String(Boolean(options.selected)));
		}

		const dragHandleEl = this.buildContent();
		this.bindDrag(dragHandleEl);
	}

	private buildContent(): HTMLElement {
		const { task } = this;

		// 中间区域：内容 + 时间
		const middleEl = this.el.createDiv({ cls: 'aulyckanban-task-middle' });

		// 任务内容
		const contentEl = middleEl.createDiv({
			cls: `aulyckanban-task-content ${task.completed ? 'aulyckanban-task-content-completed' : ''}`,
		});
		contentEl.id = `aulyckanban-task-content-${task.id}`;
		this.el.setAttribute('aria-labelledby', contentEl.id);
		setTextWithLineBreaks(contentEl, task.content);

		this.el.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			if (this.shouldSelect(e)) {
				e.preventDefault();
				this.options.onSelectionRequest?.(e);
				this.el.focus({ preventScroll: true });
				return;
			}
			if (this.el.doc.activeElement !== this.el) {
				this.el.focus({ preventScroll: true });
			}
		});
		contentEl.addEventListener('dblclick', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (this.options.selectionMode) return;
			this.el.focus({ preventScroll: true });
			this.enterEditMode(contentEl);
		});
		this.el.addEventListener('keydown', (e: KeyboardEvent) => {
			if (
				this.options.onContextMenu &&
				(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))
			) {
				e.preventDefault();
				e.stopPropagation();
				const rect = this.el.getBoundingClientRect();
				const MouseEventConstructor = this.el.ownerDocument.defaultView?.MouseEvent ?? MouseEvent;
				this.options.onContextMenu(
					new MouseEventConstructor('contextmenu', {
						clientX: rect.left + rect.width / 2,
						clientY: rect.bottom,
					}),
				);
				return;
			}
			if (this.options.selectionMode && (e.key === 'Enter' || e.key === ' ')) {
				e.preventDefault();
				e.stopPropagation();
				this.options.onSelectionRequest?.(e);
				return;
			}
			if (e.key !== 'Enter' || e.target !== this.el) return;
			e.preventDefault();
			e.stopPropagation();
			this.enterEditMode(contentEl);
		});
		if (this.options.onContextMenu) {
			this.el.addEventListener('contextmenu', (event: MouseEvent) => {
				event.preventDefault();
				event.stopPropagation();
				this.options.onContextMenu?.(event);
			});
		}

		// 底部信息：来源与完整日期时间分行显示，操作图标固定在右侧
		const { rowEl: metaRowEl, actionsEl } = createTaskCardMeta(middleEl, {
			sourceLabel: this.sourceLabel,
			timeLabel: formatDateTimeMinute(task.updatedAt ?? task.createdAt),
		});
		if (this.options.selectionMode) {
			this.buildSelectionCheckbox(actionsEl);
			return metaRowEl;
		}

		const archiveBtn = actionsEl.createSpan({
			cls: 'aulyckanban-task-archive',
		});
		setIcon(archiveBtn, 'archive');
		archiveBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			new ConfirmModal(this.app, {
				message: t('task.confirm.archive'),
				onConfirm: () =>
					this.store.dispatch({
						type: 'TOGGLE_TASK',
						payload: {
							viewId: this.viewId,
							columnId: this.columnId,
							taskId: this.task.id,
						},
					}),
			}).open();
		});

		// 删除按钮（两次点击确认）
		const deleteBtn = actionsEl.createSpan({
			text: '✕',
			cls: 'aulyckanban-task-delete',
		});
		deleteBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			new ConfirmModal(this.app, {
				message: t('task.confirm.delete'),
				isDestructive: true,
				onConfirm: () =>
					this.store.dispatch({
						type: 'DELETE_TASK',
						payload: {
							viewId: this.viewId,
							columnId: this.columnId,
							taskId: this.task.id,
						},
					}),
			}).open();
		});
		return metaRowEl;
	}

	private buildSelectionCheckbox(parentEl: HTMLElement): void {
		const labelEl = parentEl.createEl('label', { cls: 'aulyckanban-task-select-label' });
		const checkboxEl = labelEl.createEl('input', {
			cls: 'aulyckanban-task-select-checkbox',
			attr: { type: 'checkbox' },
		});
		checkboxEl.checked = Boolean(this.options.selected);
		labelEl.addEventListener('click', (event: MouseEvent) => event.stopPropagation());
		checkboxEl.addEventListener('click', (event: MouseEvent) => event.stopPropagation());
		checkboxEl.addEventListener('change', (event: Event) => {
			this.options.onSelectionRequest?.(event as MouseEvent);
		});
	}

	private shouldSelect(event: MouseEvent): boolean {
		return Boolean(this.options.selectionMode || event.metaKey || event.ctrlKey || event.shiftKey);
	}

	private bindDrag(dragHandleEl: HTMLElement): void {
		if (!this.options.onDragStart) return;
		dragHandleEl.draggable = true;
		dragHandleEl.addEventListener('dragstart', (event: DragEvent) => {
			this.el.addClass('aulyckanban-task-dragging');
			const taskCount = this.options.onDragStart?.(event) ?? 1;
			this.setTaskDragImage(event, taskCount);
		});
		dragHandleEl.addEventListener('dragend', (event: DragEvent) => {
			this.el.removeClass('aulyckanban-task-dragging');
			this.options.onDragEnd?.(event);
		});
	}

	private setTaskDragImage(event: DragEvent, taskCount: number): void {
		if (!event.dataTransfer?.setDragImage) return;
		if (taskCount <= 1) {
			event.dataTransfer.setDragImage(this.el, 24, 20);
			return;
		}
		const ownerDocument = this.el.ownerDocument;
		const previewEl = this.el.createDiv({
			cls: 'aulyckanban-task-drag-preview',
			text: t('task.drag.count').replace('{count}', String(taskCount)),
		});
		previewEl.setAttribute('aria-hidden', 'true');
		ownerDocument.body.appendChild(previewEl);
		event.dataTransfer.setDragImage(previewEl, 24, 20);
		this.el.win.requestAnimationFrame(() => previewEl.remove());
	}

	/**
	 * 双击任务内容或在卡片获得焦点时按 Enter 进入内联编辑模式
	 */
	private enterEditMode(contentEl: HTMLElement): void {
		// 避免重复进入
		if (contentEl.querySelector('.aulyckanban-edit-textarea')) return;

		this.el.addClass('aulyckanban-task-editing');

		const currentText = this.task.content;

		// 隐藏原文本，换成编辑框：Enter 保存，Shift+Enter 换行，Escape 取消，失焦自动保存
		contentEl.empty();
		createInlineInput(contentEl, {
			multiline: true,
			cls: 'aulyckanban-edit-textarea',
			initialValue: currentText,
			focusOnMount: true,
			stopClickPropagation: true,
			blurBehavior: 'commit',
			onCommit: (value, trigger) => {
				this.saveEdit(value.trim() || currentText, trigger === 'enter', contentEl);
			},
			onCancel: () => this.saveEdit(currentText, true, contentEl),
		});
	}

	private saveEdit(content: string, restoreCardFocus: boolean, contentEl: HTMLElement): void {
		this.el.removeClass('aulyckanban-task-editing');

		if (content === this.task.content) {
			// 内容未变（取消编辑）：只在本地退出编辑态，不触发数据变更和保存
			contentEl.empty();
			setTextWithLineBreaks(contentEl, this.task.content);
			if (restoreCardFocus) this.focusCardAfterRender();
			return;
		}

		this.store.dispatch({
			type: 'EDIT_TASK',
			payload: {
				viewId: this.viewId,
				columnId: this.columnId,
				taskId: this.task.id,
				content,
			},
		});
		if (restoreCardFocus) this.focusCardAfterRender();
	}

	private focusCardAfterRender(): void {
		const boardEl = this.el.closest<HTMLElement>('.aulyckanban-kanban-container');
		this.el.win.requestAnimationFrame(() => {
			const card = Array.from(
				boardEl?.querySelectorAll<HTMLElement>('.aulyckanban-task') ?? [],
			).find(
				(item) =>
					item.dataset['viewId'] === this.viewId &&
					item.dataset['columnId'] === this.columnId &&
					item.dataset['taskId'] === this.task.id,
			);
			card?.focus({ preventScroll: true });
			card?.scrollIntoView({ block: 'nearest' });
		});
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
