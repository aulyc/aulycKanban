import type { Task } from '../types';
import type { KanbanStore } from '../store';
import { formatDateTimeMinute } from '../utils/datetime';

/**
 * 任务卡片组件
 * - 单击内容进入编辑模式（inline textarea）
 * - 删除按钮两次点击确认（第一次变色，第二次删除）
 * - 显示创建/修改时间
 */
export class TaskCard {
	private el: HTMLElement;
	private store: KanbanStore;
	private columnId: string;
	private task: Task;
	private deleteArmed = false;
	private deleteTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		parentEl: HTMLElement,
		store: KanbanStore,
		columnId: string,
		task: Task,
	) {
		this.store = store;
		this.columnId = columnId;
		this.task = task;

		this.el = parentEl.createDiv({
			cls: `xaulyc-task ${task.completed ? 'xaulyc-task-completed' : ''}`,
		});
		this.el.draggable = true;
		this.el.dataset['taskId'] = task.id;
		this.el.dataset['columnId'] = columnId;

		this.buildContent();
	}

	private buildContent(): void {
		const { task, columnId } = this;

		// Checkbox
		const checkbox = this.el.createDiv({
			cls: `xaulyc-checkbox ${task.completed ? 'xaulyc-checkbox-checked' : ''}`,
		});
		checkbox.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			this.store.dispatch({
				type: 'TOGGLE_TASK',
				payload: { columnId, taskId: task.id },
			});
		});

		// 中间区域：内容 + 时间
		const middleEl = this.el.createDiv({ cls: 'xaulyc-task-middle' });

		// 任务内容（单击进入编辑模式）
		const contentEl = middleEl.createDiv({
			cls: `xaulyc-task-content ${task.completed ? 'xaulyc-task-content-completed' : ''}`,
		});
		this.setTextWithLineBreaks(contentEl, task.content);

		contentEl.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			this.enterEditMode(contentEl);
		});

		// 时间显示
		const timeEl = middleEl.createDiv({ cls: 'xaulyc-task-time' });
		const timeStr = this.formatTime(task.updatedAt ?? task.createdAt);
		timeEl.setText(timeStr);

		// 删除按钮（两次点击确认）
		const deleteBtn = this.el.createSpan({
			text: '✖',
			cls: 'xaulyc-task-delete',
		});
		deleteBtn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			this.handleDelete(deleteBtn);
		});
	}

	/**
	 * 单击进入内联编辑模式
	 */
	private enterEditMode(contentEl: HTMLElement): void {
		// 避免重复进入
		if (contentEl.querySelector('.xaulyc-edit-textarea')) return;

		const currentText = this.task.content;

		// 隐藏原文本
		contentEl.empty();

		const textarea = contentEl.createEl('textarea', {
			cls: 'xaulyc-edit-textarea',
			attr: { rows: '2' },
		});
		textarea.value = currentText;

		// 自动调整高度
		textarea.style.height = 'auto';
		textarea.style.height = textarea.scrollHeight + 'px';

		textarea.addEventListener('input', () => {
			textarea.style.height = 'auto';
			textarea.style.height = textarea.scrollHeight + 'px';
		});

		// Enter 保存，Shift+Enter 换行，Escape 取消
		textarea.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				this.saveEdit(textarea.value.trim());
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				this.saveEdit(currentText);
			}
		});

		// 失焦自动保存
		textarea.addEventListener('blur', () => {
			const newVal = textarea.value.trim();
			this.saveEdit(newVal || currentText);
		});

		textarea.focus();
		textarea.setSelectionRange(textarea.value.length, textarea.value.length);
	}

	private saveEdit(content: string): void {
		if (content !== this.task.content) {
			this.store.dispatch({
				type: 'EDIT_TASK',
				payload: { columnId: this.columnId, taskId: this.task.id, content },
			});
		} else {
			// 内容未变也需要刷新 UI（退出编辑模式）
			this.store.dispatch({
				type: 'EDIT_TASK',
				payload: { columnId: this.columnId, taskId: this.task.id, content: this.task.content },
			});
		}
	}

	/**
	 * 两次点击删除
	 * 第一次：变红警告（3 秒后恢复）
	 * 第二次：执行删除
	 */
	private handleDelete(btn: HTMLElement): void {
		if (this.deleteArmed) {
			// 第二次点击 -> 真正删除
			if (this.deleteTimer) {
				clearTimeout(this.deleteTimer);
				this.deleteTimer = null;
			}
			this.store.dispatch({
				type: 'DELETE_TASK',
				payload: { columnId: this.columnId, taskId: this.task.id },
			});
		} else {
			// 第一次点击 -> 变色警告
			this.deleteArmed = true;
			btn.classList.add('xaulyc-task-delete-armed');
			btn.setText('✓');

			// 3 秒后恢复
			this.deleteTimer = setTimeout(() => {
				this.deleteArmed = false;
				btn.classList.remove('xaulyc-task-delete-armed');
				btn.setText('✖');
				this.deleteTimer = null;
			}, 3000);
		}
	}

	/**
	 * 格式化时间显示（完整年月日+时间）
	 */
	private formatTime(isoStr: string): string {
		return formatDateTimeMinute(isoStr);
	}

	private setTextWithLineBreaks(el: HTMLElement, text: string): void {
		const lines = text.split('\n');
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line !== undefined) {
				el.appendText(line);
			}
			if (i < lines.length - 1) {
				el.createEl('br');
			}
		}
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
