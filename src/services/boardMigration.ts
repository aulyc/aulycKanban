import type { BoardData } from '../types';
import { getDefaultBoardData } from '../constants';

/**
 * 判断数据是否可能是可迁移的看板结构
 */
export function isMigratableBoardData(data: Record<string, unknown>): boolean {
	return Boolean(data['work'] && data['personal']) || Array.isArray(data['columns']);
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
		const board = raw as BoardData;
		board.workArchive ??= { tasks: [] };
		board.personalArchive ??= { tasks: [] };
		return board;
	}

	if (Array.isArray(obj['columns'])) {
		return {
			work: { columns: obj['columns'] as BoardData['work']['columns'] },
			personal: getDefaultBoardData().personal,
			workArchive: { tasks: [] },
			personalArchive: { tasks: [] },
		};
	}

	return getDefaultBoardData();
}

