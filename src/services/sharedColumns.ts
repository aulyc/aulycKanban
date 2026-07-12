import type { BoardData, Column } from '../types';

/**
 * 统一任意数量任务类型的象限定义，同时保留每个任务类型自己的 tasks 数组。
 * 迁移旧数据时按任务类型顺序合并定义，较早出现的标题和顺序优先。
 */
export function synchronizeSharedColumnDefinitions(board: BoardData): BoardData {
	const definitions = new Map<string, Pick<Column, 'id' | 'title' | 'order'>>();
	for (const view of [...board.views].sort((a, b) => a.order - b.order)) {
		for (const column of view.columns) {
			if (!definitions.has(column.id)) {
				definitions.set(column.id, {
					id: column.id,
					title: column.title,
					order: column.order ?? definitions.size,
				});
			}
		}
	}

	const ordered = [...definitions.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	for (const view of board.views) {
		const existing = new Map(view.columns.map((column) => [column.id, column]));
		view.columns = ordered.map((definition, index) => ({
			...definition,
			order: index,
			tasks: existing.get(definition.id)?.tasks ?? [],
		}));
		board.archives[view.id] ??= { tasks: [] };
	}
	return board;
}
