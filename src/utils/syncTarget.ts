import type { ActionType, ViewKind } from '../types';

export type MutationSyncTarget = { kind: 'all' } | { kind: 'view'; viewId: ViewKind };

/** 会同时影响全部任务类型的操作。 */
const MULTI_VIEW_MUTATION_ACTIONS: ReadonlySet<ActionType> = new Set([
	'ADD_VIEW',
	'RENAME_VIEW',
	'DELETE_VIEW',
	'ADD_COLUMN',
	'RENAME_COLUMN',
	'DELETE_COLUMN',
	'REORDER_COLUMNS',
	'SET_BOARD_DATA',
	'CLEAR_ALL_DATA',
]);

/**
 * 聚合列表可以修改非当前任务类型的卡片；同步必须跟随真实来源，
 * 不能只使用当前保留的任务类型选择。
 */
export function getMutationSyncTarget(
	actionType: ActionType,
	currentViewId: ViewKind,
	mutatedViewId: ViewKind | null,
): MutationSyncTarget {
	if (MULTI_VIEW_MUTATION_ACTIONS.has(actionType)) return { kind: 'all' };
	return { kind: 'view', viewId: mutatedViewId ?? currentViewId };
}
