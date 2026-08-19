import type { BoardData, DeepReadonly, PluginSettings, Task, TaskView } from '../types';

function cloneTask(task: DeepReadonly<Task>): Task {
	return { ...task };
}

function cloneView(view: DeepReadonly<TaskView>): TaskView {
	return {
		...view,
		columns: view.columns.map((column) => ({
			...column,
			tasks: column.tasks.map(cloneTask),
		})),
	};
}

/** 复制完整看板状态，确保 Store 与调用方不共享任何嵌套可写引用。 */
export function cloneBoardData(board: DeepReadonly<BoardData>): BoardData {
	return {
		views: board.views.map(cloneView),
		archives: Object.fromEntries(
			Object.entries(board.archives).map(([viewId, archive]) => [
				viewId,
				{ tasks: archive.tasks.map(cloneTask) },
			]),
		),
	};
}

/** 复制设置及其动态同步目标，避免浅拷贝泄漏嵌套对象。 */
export function cloneSettings(settings: DeepReadonly<PluginSettings>): PluginSettings {
	return {
		...settings,
		viewSyncTargets: Object.fromEntries(
			Object.entries(settings.viewSyncTargets).map(([viewId, target]) => [viewId, { ...target }]),
		),
		archive: { ...settings.archive },
	};
}
