import type { Column, PluginSettings, BoardData } from './types';
import { t } from './i18n';

/** 自定义视图类型标识 */
export const VIEW_TYPE_KANBAN = 'aulyckanban-view';
/** 归档中“未分类”分组的内部 ID */
export const ARCHIVE_UNCATEGORIZED_ID = '__uncategorized';

/** ID 生成前缀 */
export const ID_PREFIX = {
	TASK: 'task',
	COLUMN: 'col',
} as const;

/** 备份文件格式版本 */
export const BACKUP_VERSION = '2.0';

/** 归档数据键名映射 */
export const ARCHIVE_KEY: Record<'work' | 'personal', 'workArchive' | 'personalArchive'> = {
	work: 'workArchive',
	personal: 'personalArchive',
};

/** 性能配置常量 */
export const PERFORMANCE = {
	/** 保存防抖时间（毫秒） */
	SAVE_DEBOUNCE: 500,
	/** 同步防抖时间（毫秒） */
	SYNC_DEBOUNCE: 2000,
} as const;

/** 默认列定义模板（带 order） */
export const COLUMN_DEFINITIONS: ReadonlyArray<{ id: string; titleKey: string; order: number }> = [
	{ id: 'periodic', titleKey: 'column.periodic', order: 0 },
	{ id: 'urgent-important', titleKey: 'column.urgentImportant', order: 1 },
	{ id: 'important-not-urgent', titleKey: 'column.importantNotUrgent', order: 2 },
	{ id: 'urgent-not-important', titleKey: 'column.urgentNotImportant', order: 3 },
	{ id: 'not-urgent-not-important', titleKey: 'column.notUrgentNotImportant', order: 4 },
];

/** 当前数据 schema 版本 */
export const CURRENT_SCHEMA_VERSION = 2;

/** 默认设置 */
export const DEFAULT_SETTINGS: PluginSettings = {
	currentView: 'work',
	activeColumnId: 'periodic',
	showArchive: false,

	work: { filePath: '' },
	personal: { filePath: '' },
	archive: { filePath: '' },
	schemaVersion: CURRENT_SCHEMA_VERSION,
	saveDebounce: PERFORMANCE.SAVE_DEBOUNCE,
	syncDebounce: PERFORMANCE.SYNC_DEBOUNCE,
};

/** 生成默认看板数据 */
export function getDefaultBoardData(): BoardData {
	const createColumns = (): Column[] =>
		COLUMN_DEFINITIONS.map((def) => ({
			id: def.id,
			title: t(def.titleKey),
			order: def.order,
			tasks: [],
		}));

	return {
		work: { columns: createColumns() },
		personal: { columns: createColumns() },
	};
}
