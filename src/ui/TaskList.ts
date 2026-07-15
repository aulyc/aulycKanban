import type { App } from 'obsidian';
import type { KanbanStore } from '../store';
import type { TaskRef } from '../utils/taskQuery';
import { getTaskRefKey } from '../utils/taskQuery';
import { t } from '../i18n';
import { TaskCard } from './TaskCard';

/** 当前任务范围与象限范围交叉后的未归档任务列表。 */
export class TaskList {
	private readonly el: HTMLElement;
	private readonly app: App;
	private readonly store: KanbanStore;
	private readonly scrollTopByScope = new Map<string, number>();
	private cardCache = new Map<string, { el: HTMLElement; snapshot: string }>();

	constructor(parentEl: HTMLElement, app: App, store: KanbanStore) {
		this.app = app;
		this.store = store;
		this.el = parentEl.createDiv({ cls: 'aulyckanban-task-list' });
	}

	render(): void {
		const previousScopeKey = this.el.dataset['scopeKey'] ?? '';
		const previousTasksEl = this.el.querySelector<HTMLElement>('.aulyckanban-tasks');
		if (previousScopeKey && previousTasksEl) {
			this.scrollTopByScope.set(previousScopeKey, previousTasksEl.scrollTop);
		}

		this.el.empty();
		const scopeKey = this.getScopeKey();
		this.el.dataset['scopeKey'] = scopeKey;
		const refs = this.store.getVisibleTaskRefs();
		if (refs.length === 0) {
			this.cardCache.clear();
			this.el.createDiv({
				text: this.store.getSearchKeyword() ? t('task.search.noMatch') : t('md.noTasks'),
				cls: 'aulyckanban-task-list-empty',
			});
			return;
		}

		const tasksEl = this.el.createDiv({ cls: 'aulyckanban-tasks' });
		const nextCache = new Map<string, { el: HTMLElement; snapshot: string }>();
		for (const ref of refs) {
			const key = getTaskRefKey(ref);
			const sourceLabel = this.getSourceLabel(ref);
			const snapshot = `${key}|${ref.task.content}|${ref.task.completed}|${ref.task.updatedAt ?? ''}|${ref.task.createdAt}|${sourceLabel ?? ''}`;
			const cached = this.cardCache.get(key);
			if (cached?.snapshot === snapshot) {
				tasksEl.appendChild(cached.el);
				nextCache.set(key, cached);
				continue;
			}
			const card = new TaskCard(
				this.app,
				this.store,
				ref.viewId,
				ref.columnId,
				ref.task,
				sourceLabel,
			);
			const cardEl = card.getEl();
			tasksEl.appendChild(cardEl);
			nextCache.set(key, { el: cardEl, snapshot });
		}
		this.cardCache = nextCache;

		const savedScrollTop = this.scrollTopByScope.get(scopeKey);
		if (savedScrollTop !== undefined) tasksEl.scrollTop = savedScrollTop;
	}

	private getScopeKey(): string {
		return [
			this.store.getTaskScope(),
			this.store.getCurrentView(),
			this.store.getColumnScope(),
			this.store.getActiveColumnId(),
			this.store.getSearchKeyword(),
		].join('|');
	}

	private getSourceLabel(ref: TaskRef): string | undefined {
		const labels: string[] = [];
		if (this.store.getTaskScope() === 'all') labels.push(ref.viewTitle);
		if (this.store.getColumnScope() === 'all') labels.push(ref.columnTitle);
		return labels.length > 0 ? labels.join(' · ') : undefined;
	}

	getEl(): HTMLElement {
		return this.el;
	}
}
