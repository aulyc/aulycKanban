import type { Task } from '../types';
import type { KanbanStore } from '../store';
import { t } from '../i18n';
import { formatDateTimeMinute } from '../utils/datetime';
import { setTextWithLineBreaks, autoResizeTextarea } from '../utils/dom';

/**
 * 任务卡片组件
 * - 单击内容进入编辑模式（inline textarea）
 * - 删除按钮两次点击确认（第一次变色，第二次删除）
 * - 显示创建/修改时间
 */
export class TaskCard {
	private readonly el: HTMLElement;
	private readonly store: KanbanStore;
	private readonly columnId: string;
	private readonly task: Task;

	constructor(
		store: KanbanStore,
		columnId: string,
		task: Task,
	) {
		this.store = store;
		this.columnId = columnId;
		this.task = task;

		this.el = document.createElement('div');
		this.el.className = `aulyckanban-task${task.completed ? ' aulyckanban-task-completed' : ''}`;
		this.el.draggable = true;
		this.el.tabIndex = -1;
		this.el.setAttribute('role', 'button');
		this.el.setAttribute('aria-label', task.content);
		this.el.dataset['taskId'] = task.id;
		this.el.dataset['columnId'] = columnId;

		this.buildContent();
	}

	private buildContent(): void {
		const { task } = this;

		// 中间区域：内容 + 时间
		const middleEl = this.el.createDiv({ cls: 'aulyckanban-task-middle' });

		// 任务内容（单击进入编辑模式）
		const contentEl = middleEl.createDiv({
			cls: `aulyckanban-task-content ${task.completed ? 'aulyckanban-task-content-completed' : ''}`,
		});
		setTextWithLineBreaks(contentEl, task.content);

		contentEl.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			this.enterEditMode(contentEl);
		});
		this.el.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key !== 'Enter' || e.target !== this.el) return;
			e.preventDefault();
			e.stopPropagation();
			this.enterEditMode(contentEl);
		});

		// 底部信息行：时间（左） + 操作图标（右）
		const metaRowEl = middleEl.createDiv({ cls: 'aulyckanban-task-meta-row' });
		const timeEl = metaRowEl.createDiv({ cls: 'aulyckanban-task-time' });
		const timeStr = this.formatTime(task.updatedAt ?? task.createdAt);
		timeEl.setText(timeStr);

		const actionsEl = metaRowEl.createDiv({ cls: 'aulyckanban-task-actions' });

		const archiveBtn = actionsEl.createSpan({
			text: '⤓',
			cls: 'aulyckanban-task-archive',
		});
		archiveBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			if (!confirm(t('task.confirm.archive'))) return;
			this.store.dispatch({
				type: 'TOGGLE_TASK',
				payload: { columnId: this.columnId, taskId: this.task.id },
			});
		});

		// 删除按钮（两次点击确认）
		const deleteBtn = actionsEl.createSpan({
			text: '✕',
			cls: 'aulyckanban-task-delete',
		});
		deleteBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			if (!confirm(t('task.confirm.delete'))) return;
			this.store.dispatch({
				type: 'DELETE_TASK',
				payload: { columnId: this.columnId, taskId: this.task.id },
			});
		});
	}

	/**
	 * 单击进入内联编辑模式
	 */
	private enterEditMode(contentEl: HTMLElement): void {
		// 避免重复进入
		if (contentEl.querySelector('.aulyckanban-edit-textarea')) return;

		this.el.addClass('aulyckanban-task-editing');

		const currentText = this.task.content;

		// 隐藏原文本
		contentEl.empty();

		const textarea = contentEl.createEl('textarea', {
			cls: 'aulyckanban-edit-textarea',
			attr: { rows: '1' },
		});
		textarea.value = currentText;

		autoResizeTextarea(textarea);
		let finished = false;
		const finish = (content: string, restoreCardFocus: boolean): void => {
			if (finished) return;
			finished = true;
			this.saveEdit(content, restoreCardFocus);
		};

		// Enter 保存，Shift+Enter 换行，Escape 取消
		textarea.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				finish(textarea.value.trim() || currentText, true);
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				finish(currentText, true);
			}
		});

		// 失焦自动保存
		textarea.addEventListener('blur', () => {
			const newVal = textarea.value.trim();
			finish(newVal || currentText, false);
		});

		textarea.focus();
		textarea.setSelectionRange(textarea.value.length, textarea.value.length);
	}

	private saveEdit(content: string, restoreCardFocus: boolean): void {
		this.el.removeClass('aulyckanban-task-editing');

		if (content === this.task.content) {
			// 内容未变也需要刷新 UI（退出编辑模式）
			this.store.dispatch({
				type: 'EDIT_TASK',
				payload: { columnId: this.columnId, taskId: this.task.id, content: this.task.content },
			});
			if (restoreCardFocus) this.focusCardAfterRender();
			return;
		}

		this.store.dispatch({
			type: 'EDIT_TASK',
			payload: { columnId: this.columnId, taskId: this.task.id, content },
		});
		if (restoreCardFocus) this.focusCardAfterRender();
	}

	private focusCardAfterRender(): void {
		const boardEl = this.el.closest<HTMLElement>('.aulyckanban-kanban-container');
		requestAnimationFrame(() => {
			const card = Array.from(boardEl?.querySelectorAll<HTMLElement>('.aulyckanban-task') ?? [])
				.find((item) => item.dataset['taskId'] === this.task.id);
			card?.focus({ preventScroll: true });
			card?.scrollIntoView({ block: 'nearest' });
		});
	}

	/**
	 * 格式化时间显示（完整年月日+时间）
	 */
	private formatTime(isoStr: string): string {
		return formatDateTimeMinute(isoStr);
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
