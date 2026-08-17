import type { UiLanguage } from './i18n';

/**
 * 看板数据类型定义
 */

/** 动态任务类型 ID */
export type ViewKind = string;

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
	sourceColumnId?: string;
}

/** 看板列/分类 */
export interface Column {
	id: string;
	title: string;
	order?: number;
	tasks: Task[];
}

/** 单视图数据：象限定义与另一视图共享，tasks 内容独立 */
export interface ViewData {
	columns: Column[];
}

/** 顶部任务类型（工作、个人或用户自定义类型） */
export interface TaskView extends ViewData {
	id: ViewKind;
	title: string;
	order: number;
}

/** 归档数据（按视图） */
export interface ArchiveData {
	tasks: Task[];
}

/** 完整看板数据（动态任务类型 + 按类型归档） */
export interface BoardData {
	views: TaskView[];
	archives: Record<ViewKind, ArchiveData>;
}

/** 同步目标配置 */
export interface SyncTarget {
	filePath: string;
}

/** 插件设置 */
export interface PluginSettings {
	/** 插件界面语言；system 表示跟随 Obsidian */
	uiLanguage: UiLanguage;
	currentView: ViewKind;
	/** 当前选中的分类 ID */
	activeColumnId: string;
	/** 是否正在查看归档 */
	showArchive: boolean;

	/** 自动管理的 Markdown 同步目录 */
	syncFolder: string;
	/** 每个任务类型对应的同步文件 */
	viewSyncTargets: Record<ViewKind, SyncTarget>;
	/** 归档同步文件路径 */
	archive: SyncTarget;
	schemaVersion: number;
	/** 保存防抖时间（毫秒） */
	saveDebounce: number;
	/** 同步防抖时间（毫秒） */
	syncDebounce: number;
}

/** 持久化数据（settings + board 合并存储） */
export interface PluginData {
	settings: PluginSettings;
	board: BoardData;
}

/** 普通任务的稳定坐标；任务 ID 只在任务类型与象限坐标内唯一。 */
export interface TaskCoordinate {
	viewId: ViewKind;
	columnId: string;
	taskId: string;
}

/** Store Action（可辨识联合类型，每种操作有独立的 payload 类型） */
export type Action =
	| { type: 'ADD_TASK'; payload: { viewId?: ViewKind; columnId: string; content: string } }
	| {
			type: 'EDIT_TASK';
			payload: { viewId?: ViewKind; columnId: string; taskId: string; content: string };
	  }
	| { type: 'DELETE_TASK'; payload: { viewId?: ViewKind; columnId: string; taskId: string } }
	| { type: 'TOGGLE_TASK'; payload: { viewId?: ViewKind; columnId: string; taskId: string } }
	| {
			type: 'MOVE_TASKS';
			payload: {
				tasks: readonly TaskCoordinate[];
				targetViewId?: ViewKind;
				targetColumnId?: string;
			};
	  }
	| { type: 'SWITCH_VIEW'; payload: { view: ViewKind } }
	| { type: 'SHOW_ALL_TASKS' }
	| { type: 'SHOW_ALL_COLUMNS' }
	| { type: 'SET_SEARCH_QUERY'; payload: { keyword: string } }
	| { type: 'ADD_VIEW'; payload: { title: string } }
	| { type: 'RENAME_VIEW'; payload: { viewId: ViewKind; title: string } }
	| { type: 'DELETE_VIEW'; payload: { viewId: ViewKind } }
	| { type: 'REORDER_VIEWS'; payload: { viewIds: ViewKind[] } }
	| { type: 'SELECT_COLUMN'; payload: { columnId: string } }
	| { type: 'ADD_COLUMN'; payload: { title: string } }
	| { type: 'RENAME_COLUMN'; payload: { columnId: string; title: string } }
	| { type: 'DELETE_COLUMN'; payload: { columnId: string; moveTasks?: boolean } }
	| { type: 'REORDER_COLUMNS'; payload: { columnIds: string[] } }
	| { type: 'TOGGLE_ARCHIVE_VIEW' }
	| { type: 'RESTORE_TASK'; payload: { viewId?: ViewKind; taskId: string } }
	| {
			type: 'DELETE_ARCHIVE_TASKS';
			payload: { tasks: Array<{ viewId: ViewKind; taskId: string }> } | { taskIds: string[] };
	  }
	| { type: 'SET_BOARD_DATA'; payload: { board: BoardData } }
	| { type: 'CLEAR_ALL_DATA' }
	| { type: 'UPDATE_SETTINGS'; payload: Partial<PluginSettings> };

/** 从 Action 联合类型中提取所有 type 字面量 */
export type ActionType = Action['type'];
