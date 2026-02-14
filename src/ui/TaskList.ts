import type { Task } from '../types';
import type { KanbanStore } from '../store';
import { TaskCard } from './TaskCard';
import { t } from '../i18n';

/**
 * 左侧任务列表组件
 * 显示当前选中分类的标题、输入框、任务卡片
 */
export class TaskList {
	private el: HTMLElement;
	private store: KanbanStore;

	constructor(parentEl: HTMLElement, store: KanbanStore) {
		this.store = store;
		this.el = parentEl.createDiv({ cls: 'xaulyc-task-list' });
	}

	render(): void {
		this.el.empty();

		const column = this.store.getActiveColumn();
		if (!column) {
			this.el.createDiv({ text: t('md.noTasks'), cls: 'xaulyc-task-list-empty' });
			return;
		}

		// 分类标题 + 任务数
		const headerEl = this.el.createDiv({ cls: 'xaulyc-task-list-header' });
		headerEl.createSpan({ text: column.title, cls: 'xaulyc-task-list-title' });
		headerEl.createSpan({ text: String(column.tasks.length), cls: 'xaulyc-task-list-count' });

		// 输入框（Enter 添加任务）
		this.buildInlineInput(column.id);

		// 任务列表
		const tasksEl = this.el.createDiv({ cls: 'xaulyc-tasks' });

		const sortedTasks = [...column.tasks].sort((a: Task, b: Task) => {
			if (a.completed !== b.completed) return a.completed ? 1 : -1;
			if (a.completed && b.completed) {
				const aTime = new Date(a.completedAt ?? a.createdAt).getTime();
				const bTime = new Date(b.completedAt ?? b.createdAt).getTime();
				return bTime - aTime;
			}
			return 0;
		});

		for (const task of sortedTasks) {
			new TaskCard(tasksEl, this.store, column.id, task);
		}
	}

	private buildInlineInput(columnId: string): void {
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

		// Enter 提交，Shift+Enter 换行，Tab/Shift+Tab 切换分类
		inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				const content = inputEl.value.trim();
				if (content) {
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

	getEl(): HTMLElement {
		return this.el;
	}
}
