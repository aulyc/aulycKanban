import type { Task } from '../types';
import type { KanbanStore } from '../store';
import { TaskCard } from './TaskCard';
import { t } from '../i18n';
import { autoResizeTextarea } from '../utils/dom';

/**
 * 左侧任务列表组件
 * 显示当前选中象限的输入框和任务卡片
 */
export class TaskList {
	private readonly el: HTMLElement;
	private readonly store: KanbanStore;
	private readonly inputDraftByColumn = new Map<string, string>();
	private readonly scrollTopByColumn = new Map<string, number>();
	/** 按 taskId 缓存已创建的 DOM 元素和快照，避免每次全量重建 */
	private cardCache = new Map<string, { el: HTMLElement; snapshot: string }>();

	constructor(parentEl: HTMLElement, store: KanbanStore) {
		this.store = store;
		this.el = parentEl.createDiv({ cls: 'aulyckanban-task-list' });
	}

	render(): void {
		const prevColumnId = this.el.dataset['columnId'] ?? '';
		const prevInputEl = this.el.querySelector<HTMLTextAreaElement>('.aulyckanban-inline-input');
		const prevTasksEl = this.el.querySelector<HTMLElement>('.aulyckanban-tasks');
		const wasInputFocused = document.activeElement === prevInputEl;
		const selectionStart = prevInputEl?.selectionStart ?? null;
		const selectionEnd = prevInputEl?.selectionEnd ?? null;

		if (prevColumnId && prevInputEl) {
			this.inputDraftByColumn.set(prevColumnId, prevInputEl.value);
		}
		if (prevColumnId && prevTasksEl) {
			this.scrollTopByColumn.set(prevColumnId, prevTasksEl.scrollTop);
		}

		this.el.empty();

		const column = this.store.getActiveColumn();
		if (!column) {
			this.cardCache.clear();
			this.el.createDiv({ text: t('md.noTasks'), cls: 'aulyckanban-task-list-empty' });
			return;
		}
		this.el.dataset['columnId'] = column.id;

		this.buildInlineInput(
			column.id,
			this.inputDraftByColumn.get(column.id) ?? '',
			wasInputFocused && prevColumnId === column.id,
			selectionStart,
			selectionEnd,
		);

		const tasksEl = this.el.createDiv({ cls: 'aulyckanban-tasks' });

		const sortedTasks = [...column.tasks].sort((a: Task, b: Task) => {
			if (a.completed !== b.completed) return a.completed ? 1 : -1;
			if (a.completed && b.completed) {
				const aTime = new Date(a.completedAt ?? a.createdAt).getTime();
				const bTime = new Date(b.completedAt ?? b.createdAt).getTime();
				return bTime - aTime;
			}
			return 0;
		});

		const newCache = new Map<string, { el: HTMLElement; snapshot: string }>();

		for (const task of sortedTasks) {
			const snap = this.taskSnapshot(task, column.id);
			const cached = this.cardCache.get(task.id);

			if (cached?.snapshot === snap) {
				tasksEl.appendChild(cached.el);
				newCache.set(task.id, cached);
			} else {
				const card = new TaskCard(this.store, column.id, task);
				const cardEl = card.getEl();
				tasksEl.appendChild(cardEl);
				newCache.set(task.id, { el: cardEl, snapshot: snap });
			}
		}

		this.cardCache = newCache;

		const savedScrollTop = this.scrollTopByColumn.get(column.id);
		if (savedScrollTop !== undefined) {
			tasksEl.scrollTop = savedScrollTop;
		}
	}

	private taskSnapshot(task: Task, columnId: string): string {
		return `${columnId}|${task.content}|${task.completed}|${task.updatedAt ?? ''}|${task.createdAt}`;
	}

	private buildInlineInput(
		columnId: string,
		draft: string,
		restoreFocus: boolean,
		selectionStart: number | null,
		selectionEnd: number | null,
	): void {
		const inputWrapper = this.el.createDiv({ cls: 'aulyckanban-inline-input-wrapper' });

		const inputEl = inputWrapper.createEl('textarea', {
			cls: 'aulyckanban-inline-input',
			attr: {
				placeholder: t('task.inputPlaceholder'),
				rows: '1',
			},
		});

		inputEl.value = draft;
		autoResizeTextarea(inputEl);
		let composing = false;

		inputEl.addEventListener('input', () => {
			this.inputDraftByColumn.set(columnId, inputEl.value);
		});
		inputEl.addEventListener('compositionstart', () => {
			composing = true;
		});
		inputEl.addEventListener('compositionend', () => {
			composing = false;
		});

		// Enter 提交，Shift+Enter 换行；Tab 由 KanbanView 在三个主要区域间切换。
		inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				if (composing || e.isComposing) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				const content = inputEl.value.trim();
				if (content) {
					inputEl.value = '';
					inputEl.style.height = 'auto';
					this.inputDraftByColumn.set(columnId, '');
					this.store.dispatch({
						type: 'ADD_TASK',
						payload: { columnId, content },
					});
				}
			}

		});

		if (restoreFocus) {
			requestAnimationFrame(() => {
				inputEl.focus({ preventScroll: true });
				if (selectionStart !== null && selectionEnd !== null) {
					inputEl.setSelectionRange(selectionStart, selectionEnd);
				}
			});
		}
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
