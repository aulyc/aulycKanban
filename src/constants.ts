import type { Column, ColumnId, PluginSettings, BoardData } from './types';

/** 自定义视图类型标识 */
export const VIEW_TYPE_KANBAN = 'xaulyc-kanban-view';

/** 性能配置常量 */
export const PERFORMANCE = {
	/** 每列可见任务数（虚拟滚动窗口） */
	VISIBLE_TASK_COUNT: 30,
	/** 任务卡片高度（像素） */
	TASK_HEIGHT: 70,
	/** 保存防抖时间（毫秒） */
	SAVE_DEBOUNCE: 500,
	/** 同步防抖时间（毫秒） */
	SYNC_DEBOUNCE: 2000,
	/** 滚动防抖时间（毫秒） */
	SCROLL_DEBOUNCE: 50,
	/** 最大缓存条目数 */
	MAX_CACHE_SIZE: 50,
	/** 缓存清理后保留数 */
	CACHE_TRIM_SIZE: 25,
} as const;

/** 列定义模板（用于生成默认数据） */
export const COLUMN_DEFINITIONS: ReadonlyArray<{ id: ColumnId; title: string }> = [
	{ id: 'periodic', title: '🔄 周期任务' },
	{ id: 'urgent-important', title: '🔥 重要且紧急' },
	{ id: 'important-not-urgent', title: '⭐ 重要不紧急' },
	{ id: 'urgent-not-important', title: '⚡ 紧急不重要' },
	{ id: 'not-urgent-not-important', title: '💤 不紧急不重要' },
];

/** 当前数据 schema 版本 */
export const CURRENT_SCHEMA_VERSION = 1;

/** 默认设置 */
export const DEFAULT_SETTINGS: PluginSettings = {
	currentView: 'work',
	showArchive: false,
	customIcon: '',
	work: { filePath: '' },
	personal: { filePath: '' },
	archive: { filePath: '' },
	schemaVersion: CURRENT_SCHEMA_VERSION,
};

/** 生成默认看板数据 */
export function getDefaultBoardData(): BoardData {
	const createColumns = (): Column[] =>
		COLUMN_DEFINITIONS.map((def) => ({
			id: def.id,
			title: def.title,
			tasks: [],
		}));

	return {
		work: { columns: createColumns() },
		personal: { columns: createColumns() },
	};
}
