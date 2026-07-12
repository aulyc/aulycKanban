import type { Task } from '../types';

/** 归档任务展示与排序所用时间：归档时间缺失时回退到完成/创建时间 */
export function getArchivedAtIso(task: Task): string {
	return task.archivedAt ?? task.completedAt ?? task.createdAt;
}

export function getArchivedAtTime(task: Task): number {
	return new Date(getArchivedAtIso(task)).getTime();
}
