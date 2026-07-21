import { setIcon } from 'obsidian';
import type { App } from 'obsidian';
import type { Task } from '../types';
import type { KanbanStore } from '../store';
import { t } from '../i18n';
import { formatDateTimeMinute } from '../utils/datetime';
import { setTextWithLineBreaks } from '../utils/dom';
import { ConfirmModal } from './ConfirmModal';
import { createInlineInput } from './InlineInput';

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

	constructor(
		app: App,
		store: KanbanStore,
		viewId: string,
		columnId: string,
		task: Task,
		sourceLabel?: string,
	) {
		this.app = app;
		this.store = store;
		this.viewId = viewId;
		this.columnId = columnId;
		this.task = task;
		this.sourceLabel = sourceLabel;

		this.el = document.createElement('div');
		this.el.className = `aulyckanban-task${task.completed ? ' aulyckanban-task-completed' : ''}`;
		this.el.tabIndex = -1;
		this.el.setAttribute('role', 'button');
		this.el.dataset['viewId'] = viewId;
		this.el.dataset['taskId'] = task.id;
		this.el.dataset['columnId'] = columnId;

		this.buildContent();
	}

	private buildContent(): void {
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
			if (document.activeElement !== this.el) {
				this.el.focus({ preventScroll: true });
			}
		});
		contentEl.addEventListener('dblclick', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.el.focus({ preventScroll: true });
			this.enterEditMode(contentEl);
		});
		this.el.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key !== 'Enter' || e.target !== this.el) return;
			e.preventDefault();
			e.stopPropagation();
			this.enterEditMode(contentEl);
		});

		// 底部信息：来源与完整日期时间分行显示，操作图标固定在右侧
		const metaRowEl = middleEl.createDiv({ cls: 'aulyckanban-task-meta-row' });
		const metaDetailsEl = metaRowEl.createDiv({ cls: 'aulyckanban-task-meta-details' });
		if (this.sourceLabel) {
			metaDetailsEl.createDiv({ cls: 'aulyckanban-task-source', text: this.sourceLabel });
		}
		metaDetailsEl.createDiv({
			cls: 'aulyckanban-task-time',
			text: formatDateTimeMinute(task.updatedAt ?? task.createdAt),
		});

		const actionsEl = metaRowEl.createDiv({ cls: 'aulyckanban-task-actions' });

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
		requestAnimationFrame(() => {
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
