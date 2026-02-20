import type { BoardData, ViewData, Column } from '../types';
import { getDefaultBoardData } from '../constants';

/**
 * 判断数据是否可能是可迁移的看板结构
 */
export function isMigratableBoardData(data: Record<string, unknown>): boolean {
	return Boolean(data['work'] && data['personal']) || Array.isArray(data['columns']);
}

/**
 * 校验 ViewData 结构完整性
 */
function isValidViewData(v: unknown): v is ViewData {
	if (!v || typeof v !== 'object') return false;
	const view = v as Record<string, unknown>;
	if (!Array.isArray(view['columns'])) return false;
	return (view['columns'] as unknown[]).every((col) => {
		if (!col || typeof col !== 'object') return false;
		const c = col as Record<string, unknown>;
		return typeof c['id'] === 'string' && typeof c['title'] === 'string' && Array.isArray(c['tasks']);
	});
}

/**
 * 确保列数组中的每个列都有完整字段，过滤掉不完整的列
 */
function sanitizeColumns(columns: Column[]): Column[] {
	return columns.filter((c) => c.id && c.title && Array.isArray(c.tasks));
}

/**
 * 迁移任意来源的看板数据到当前结构
 * - 新格式: { work, personal, workArchive?, personalArchive? }
 * - 旧格式: { columns }
 * - 无效格式: 返回默认数据
 */
export function migrateBoardData(raw: unknown): BoardData {
	if (!raw || typeof raw !== 'object') {
		return getDefaultBoardData();
	}

	const obj = raw as Record<string, unknown>;

	if (obj['work'] && obj['personal']) {
		if (!isValidViewData(obj['work']) || !isValidViewData(obj['personal'])) {
			return getDefaultBoardData();
		}
		const board = raw as BoardData;
		board.work.columns = sanitizeColumns(board.work.columns);
		board.personal.columns = sanitizeColumns(board.personal.columns);
		board.workArchive ??= { tasks: [] };
		board.personalArchive ??= { tasks: [] };
		if (board.work.columns.length === 0 || board.personal.columns.length === 0) {
			return getDefaultBoardData();
		}
		return board;
	}

	if (Array.isArray(obj['columns'])) {
		const columns = sanitizeColumns(obj['columns'] as Column[]);
		if (columns.length === 0) return getDefaultBoardData();
		return {
			work: { columns },
			personal: getDefaultBoardData().personal,
			workArchive: { tasks: [] },
			personalArchive: { tasks: [] },
		};
	}

	return getDefaultBoardData();
}

