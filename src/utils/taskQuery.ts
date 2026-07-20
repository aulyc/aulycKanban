import type { BoardData, Task, ViewKind } from '../types';

export type TaskScope = 'current' | 'all' | 'archive';
export type TaskTypeScope = Exclude<TaskScope, 'archive'>;
export type ColumnScope = 'current' | 'all';

export interface TaskRef {
	viewId: ViewKind;
	viewTitle: string;
	columnId: string;
	columnTitle: string;
	task: Task;
}

export interface TaskQuery {
	taskScope: TaskScope;
	taskTypeScope: TaskTypeScope;
	currentViewId: ViewKind;
	columnScope: ColumnScope;
	activeColumnId: string;
	keyword: string;
}

export function getTaskRefKey(ref: Pick<TaskRef, 'viewId' | 'columnId' | 'task'>): string {
	return `${ref.viewId}:${ref.columnId}:${ref.task.id}`;
}

export function normalizeTaskSearchText(value: string): string {
	return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function queryTaskRefs(board: Readonly<BoardData>, query: TaskQuery): TaskRef[] {
	const keyword = normalizeTaskSearchText(query.keyword);
	const views = [...board.views]
		.sort((a, b) => a.order - b.order)
		.filter((view) => query.taskTypeScope === 'all' || view.id === query.currentViewId);
	const refs: TaskRef[] = [];
	for (const view of views) {
		const columns = [...view.columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		if (query.taskScope === 'archive') {
			for (const task of board.archives[view.id]?.tasks ?? []) {
				const column =
					columns.find((candidate) => candidate.id === task.sourceColumnId) ?? columns[0];
				if (!column) continue;
				if (query.columnScope === 'current' && column.id !== query.activeColumnId) continue;
				if (keyword && !normalizeTaskSearchText(task.content).includes(keyword)) continue;
				refs.push({
					viewId: view.id,
					viewTitle: view.title,
					columnId: column.id,
					columnTitle: column.title,
					task,
				});
			}
			continue;
		}
		for (const column of columns) {
			if (query.columnScope === 'current' && column.id !== query.activeColumnId) continue;
			for (const task of column.tasks) {
				if (keyword && !normalizeTaskSearchText(task.content).includes(keyword)) continue;
				refs.push({
					viewId: view.id,
					viewTitle: view.title,
					columnId: column.id,
					columnTitle: column.title,
					task,
				});
			}
		}
	}
	return refs;
}
