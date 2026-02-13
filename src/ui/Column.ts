import type { Column as ColumnData, Task } from '../types';
import type { KanbanStore } from '../store';
import { TaskCard } from './TaskCard';
import { t } from '../i18n';

/**
 * 看板列组件
 * 布局顺序：列标题 -> 内嵌输入框 -> 任务列表
 */
export class ColumnComponent {
	private el: HTMLElement;
	private tasksEl: HTMLElement;
	private store: KanbanStore;
	private columnData: ColumnData;

	constructor(
		parentEl: HTMLElement,
		store: KanbanStore,
		columnData: ColumnData,
	) {
		this.store = store;
		this.columnData = columnData;

		this.el = parentEl.createDiv({ cls: 'xaulyc-column' });
		this.el.dataset['columnId'] = columnData.id;

		// 1. 列标题
		this.buildHeader();

		// 2. 内嵌添加任务输入框
		this.buildInlineInput();

		// 3. 任务列表区（容器先创建，任务稍后通过 renderTasks 填充）
		this.tasksEl = this.el.createDiv({ cls: 'xaulyc-tasks' });
		this.tasksEl.dataset['columnId'] = columnData.id;
	}

	private buildHeader(): void {
		const headerEl = this.el.createDiv({ cls: 'xaulyc-column-header' });

		const leftEl = headerEl.createDiv({ cls: 'xaulyc-column-header-left' });

		leftEl.createEl('span', {
			text: this.columnData.title,
			cls: 'xaulyc-column-title',
		});

		const tasks = this.columnData.tasks ?? [];
		leftEl.createEl('span', {
			text: String(tasks.length),
			cls: 'xaulyc-column-count',
		});
	}

	/**
	 * 内嵌添加任务输入框
	 * 输入内容后 Cmd+Enter 直接添加任务（不弹窗）
	 */
	private buildInlineInput(): void {
		const inputWrapper = this.el.createDiv({ cls: 'xaulyc-inline-input-wrapper' });

		const inputEl = inputWrapper.createEl('textarea', {
			cls: 'xaulyc-inline-input',
			attr: {
				placeholder: t('task.inputPlaceholder'),
				rows: '1',
			},
		});

		// 自动调整高度
		const autoResize = (): void => {
			inputEl.style.height = 'auto';
			inputEl.style.height = inputEl.scrollHeight + 'px';
		};

		inputEl.addEventListener('input', autoResize);

		// Enter 提交，Shift+Enter 换行
		inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				const content = inputEl.value.trim();
				if (content) {
					const columnId = this.columnData.id;
					inputEl.value = '';
					inputEl.style.height = 'auto';
					this.store.dispatch({
						type: 'ADD_TASK',
						payload: { columnId, content },
					});
				}
			}
		});
	}

	/**
	 * 渲染任务列表
	 * 必须在 Board 设置好回调之后调用
	 */
	renderTasks(): void {
		this.tasksEl.empty();

		const tasks = this.columnData.tasks ?? [];

		// 排序：未完成在前，已完成按完成时间倒序
		const sortedTasks = [...tasks].sort((a: Task, b: Task) => {
			if (a.completed !== b.completed) return a.completed ? 1 : -1;
			if (a.completed && b.completed) {
				const aTime = new Date(a.completedAt ?? a.createdAt).getTime();
				const bTime = new Date(b.completedAt ?? b.createdAt).getTime();
				return bTime - aTime;
			}
			return 0;
		});

		for (const task of sortedTasks) {
			new TaskCard(this.tasksEl, this.store, this.columnData.id, task);
		}
	}

	getEl(): HTMLElement {
		return this.el;
	}

	getTasksEl(): HTMLElement {
		return this.tasksEl;
	}
}
