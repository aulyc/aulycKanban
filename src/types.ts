/**
 * 看板数据类型定义
 */

/** 视图类型：工作 / 个人 */
export type ViewKind = 'work' | 'personal';

/** 列 ID 枚举 */
export type ColumnId =
	| 'periodic'
	| 'urgent-important'
	| 'important-not-urgent'
	| 'urgent-not-important'
	| 'not-urgent-not-important';

/** 单个任务 */
export interface Task {
	id: string;
	content: string;
	completed: boolean;
	createdAt: string;
	updatedAt?: string;
	completedAt?: string;
	/** 归档时间（有值表示已归档） */
	archivedAt?: string;
	/** 归档前所在列 ID（用于归档视图分类） */
	sourceColumnId?: ColumnId;
}

/** 看板列 */
export interface Column {
	id: ColumnId;
	title: string;
	tasks: Task[];
}

/** 单视图数据 */
export interface ViewData {
	columns: Column[];
}

/** 归档数据（按视图） */
export interface ArchiveData {
	tasks: Task[];
}

/** 完整看板数据（双视图 + 归档） */
export interface BoardData {
	work: ViewData;
	personal: ViewData;
	workArchive?: ArchiveData;
	personalArchive?: ArchiveData;
}

/** 同步目标配置 */
export interface SyncTarget {
	filePath: string;
}

/** 插件设置 */
export interface PluginSettings {
	currentView: ViewKind;
	/** 是否正在查看归档 */
	showArchive: boolean;
	customIcon: string;
	work: SyncTarget;
	personal: SyncTarget;
	/** 归档同步文件路径 */
	archive: SyncTarget;
	schemaVersion: number;
}

/** 持久化数据（settings + board 合并存储） */
export interface PluginData {
	settings: PluginSettings;
	board: BoardData;
}

/** Store 操作类型 */
export type ActionType =
	| 'ADD_TASK'
	| 'EDIT_TASK'
	| 'DELETE_TASK'
	| 'TOGGLE_TASK'
	| 'MOVE_TASK'
	| 'SWITCH_VIEW'
	| 'TOGGLE_ARCHIVE_VIEW'
	| 'RESTORE_TASK'
	| 'SET_BOARD_DATA'
	| 'CLEAR_ALL_DATA'
	| 'UPDATE_SETTINGS';

/** Store Action 定义 */
export interface Action {
	type: ActionType;
	payload?: Record<string, unknown>;
}
