import type { Action, BoardData, PluginSettings, ViewKind, Task, Column, ArchiveData } from './types';
import { getDefaultBoardData, PERFORMANCE } from './constants';
import type KanbanPlugin from './main';

type Listener = () => void;

/** 会修改看板数据的 Action 类型（需要触发 md 同步） */
const DATA_MUTATION_ACTIONS: ReadonlySet<string> = new Set([
	'ADD_TASK',
	'EDIT_TASK',
	'DELETE_TASK',
	'TOGGLE_TASK',
	'MOVE_TASK',
	'RESTORE_TASK',
	'DELETE_ARCHIVE_TASKS',
	'SET_BOARD_DATA',
	'CLEAR_ALL_DATA',
	'ADD_COLUMN',
	'RENAME_COLUMN',
	'DELETE_COLUMN',
	'REORDER_COLUMNS',
]);

/**
 * 看板状态管理
 * 单一数据源，所有 UI 通过 subscribe 监听变化
 */
export class KanbanStore {
	private readonly settings: PluginSettings;
	private board: BoardData;
	private readonly plugin: KanbanPlugin;
	private readonly listeners: Set<Listener> = new Set();
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;
	private _lastActionMutatedData = false;

	constructor(settings: PluginSettings, board: BoardData, plugin: KanbanPlugin) {
		this.settings = { ...settings };
		this.board = this.ensureColumnOrder(board);
		this.plugin = plugin;
	}

	// ==================== 读取 ====================

	getSettings(): Readonly<PluginSettings> {
		return this.settings;
	}

	getBoardData(): Readonly<BoardData> {
		return this.board;
	}

	getCurrentView(): ViewKind {
		return this.settings.currentView;
	}

	isShowingArchive(): boolean {
		return this.settings.showArchive;
	}

	/** 获取当前选中的分类 ID */
	getActiveColumnId(): string {
		const columns = this.getCurrentColumns();
		const activeId = this.settings.activeColumnId;
		// 如果 activeColumnId 无效，选第一个
		if (columns.some((c) => c.id === activeId)) {
			return activeId;
		}
		return columns[0]?.id ?? '';
	}

	/** 获取当前选中分类的数据 */
	getActiveColumn(): Column | undefined {
		const activeId = this.getActiveColumnId();
		return this.getCurrentColumns().find((c) => c.id === activeId);
	}

	/** 获取当前视图的列（按 order 排序） */
	getCurrentColumns(): Column[] {
		const viewData = this.board[this.settings.currentView];
		const columns = viewData?.columns ?? [];
		return [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	}

	/** 获取当前视图的归档任务 */
	getCurrentArchive(): Task[] {
		const archiveKey = this.settings.currentView === 'work' ? 'workArchive' : 'personalArchive';
		return this.board[archiveKey]?.tasks ?? [];
	}

	/** 在指定列中查找任务 */
	findTask(columnId: string, taskId: string): Task | undefined {
		const column = this.getCurrentColumns().find((c) => c.id === columnId);
		return column?.tasks.find((t) => t.id === taskId);
	}

	/** 上一次 dispatch 是否修改了看板数据 */
	get lastActionMutatedData(): boolean {
		return this._lastActionMutatedData;
	}

	// ==================== 订阅 ====================

	subscribe(fn: Listener): () => void {
		this.listeners.add(fn);
		return () => {
			this.listeners.delete(fn);
		};
	}

	private notify(): void {
		this.listeners.forEach((fn) => fn());
	}

	// ==================== 操作 ====================

	dispatch(action: Action): void {
		switch (action.type) {
			case 'ADD_TASK':
				this.addTask(
					action.payload?.['columnId'] as string,
					action.payload?.['content'] as string,
				);
				break;

			case 'EDIT_TASK':
				this.editTask(
					action.payload?.['columnId'] as string,
					action.payload?.['taskId'] as string,
					action.payload?.['content'] as string,
				);
				break;

			case 'DELETE_TASK':
				this.deleteTask(
					action.payload?.['columnId'] as string,
					action.payload?.['taskId'] as string,
				);
				break;

			case 'TOGGLE_TASK':
				this.toggleTask(
					action.payload?.['columnId'] as string,
					action.payload?.['taskId'] as string,
				);
				break;

			case 'MOVE_TASK':
				this.moveTask(
					action.payload?.['taskId'] as string,
					action.payload?.['fromColumnId'] as string,
					action.payload?.['toColumnId'] as string,
					(action.payload?.['targetIndex'] as number) ?? 0,
				);
				break;

			case 'SWITCH_VIEW':
				this.settings.currentView = action.payload?.['view'] as ViewKind;
				this.settings.showArchive = false;
				// 切换视图后，如果 activeColumnId 无效则选第一个
				this.ensureActiveColumn();
				break;

			case 'SELECT_COLUMN':
				this.settings.activeColumnId = action.payload?.['columnId'] as string;
				break;

			case 'ADD_COLUMN':
				this.addColumn(action.payload?.['title'] as string);
				break;

			case 'RENAME_COLUMN':
				this.renameColumn(
					action.payload?.['columnId'] as string,
					action.payload?.['title'] as string,
				);
				break;

			case 'DELETE_COLUMN':
				this.deleteColumn(
					action.payload?.['columnId'] as string,
					(action.payload?.['moveTasks'] as boolean) ?? true,
				);
				break;

			case 'REORDER_COLUMNS':
				this.reorderColumns(action.payload?.['columnIds'] as string[]);
				break;

			case 'TOGGLE_ARCHIVE_VIEW':
				this.settings.showArchive = !this.settings.showArchive;
				break;

			case 'RESTORE_TASK':
				this.restoreTask(action.payload?.['taskId'] as string);
				break;

			case 'DELETE_ARCHIVE_TASKS':
				this.deleteArchiveTasks((action.payload?.['taskIds'] as string[]) ?? []);
				break;

			case 'SET_BOARD_DATA':
				this.board = this.ensureColumnOrder(action.payload?.['board'] as BoardData);
				this.ensureActiveColumn();
				break;

			case 'CLEAR_ALL_DATA':
				this.board = getDefaultBoardData();
				this.ensureActiveColumn();
				break;

			case 'UPDATE_SETTINGS':
				this.updateSettings(action.payload);
				break;
		}

		this._lastActionMutatedData = DATA_MUTATION_ACTIONS.has(action.type);
		this.notify();
		this.scheduleSave();
	}

	// ==================== 任务操作 ====================

	private addTask(columnId: string, content: string): void {
		const column = this.getRawColumn(columnId);
		if (!column) return;

		const now = new Date().toISOString();
		const task: Task = {
			id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
			content,
			completed: false,
			createdAt: now,
			updatedAt: now,
		};

		column.tasks.unshift(task);
	}

	private editTask(columnId: string, taskId: string, content: string): void {
		const task = this.findTask(columnId, taskId);
		if (task) {
			task.content = content;
			task.updatedAt = new Date().toISOString();
		}
	}

	private deleteTask(columnId: string, taskId: string): void {
		const column = this.getRawColumn(columnId);
		if (!column) return;

		const index = column.tasks.findIndex((t) => t.id === taskId);
		if (index > -1) {
			column.tasks.splice(index, 1);
		}
	}

	private toggleTask(columnId: string, taskId: string): void {
		const column = this.getRawColumn(columnId);
		if (!column) return;

		const task = column.tasks.find((t) => t.id === taskId);
		if (!task) return;

		task.completed = !task.completed;

		if (task.completed) {
			const now = new Date().toISOString();
			task.completedAt = now;
			task.archivedAt = now;
			task.sourceColumnId = columnId;

			const idx = column.tasks.indexOf(task);
			if (idx > -1) {
				column.tasks.splice(idx, 1);
			}

			this.getOrCreateArchive().tasks.unshift(task);
		} else {
			delete task.completedAt;
			delete task.archivedAt;
		}
	}

	private restoreTask(taskId: string): void {
		// 在工作和个人归档中都查找
		let archive: ArchiveData | undefined;
		let targetView: 'work' | 'personal' = this.settings.currentView;

		const workArchive = this.board.workArchive;
		const personalArchive = this.board.personalArchive;

		if (workArchive?.tasks.some((t) => t.id === taskId)) {
			archive = workArchive;
			targetView = 'work';
		} else if (personalArchive?.tasks.some((t) => t.id === taskId)) {
			archive = personalArchive;
			targetView = 'personal';
		}

		if (!archive) return;

		const idx = archive.tasks.findIndex((t) => t.id === taskId);
		if (idx === -1) return;

		const task = archive.tasks[idx];
		if (!task) return;

		archive.tasks.splice(idx, 1);

		task.completed = false;
		delete task.completedAt;
		delete task.archivedAt;

		const targetColumnId = task.sourceColumnId ?? 'periodic';
		delete task.sourceColumnId;

		// 放回对应视图的列
		const viewData = this.board[targetView];
		const column = viewData?.columns.find((c) => c.id === targetColumnId);
		if (column) {
			column.tasks.unshift(task);
		} else {
			const firstCol = viewData?.columns[0];
			if (firstCol) {
				firstCol.tasks.unshift(task);
			}
		}
	}

	private deleteArchiveTasks(taskIds: string[]): void {
		if (taskIds.length === 0) return;
		const idSet = new Set(taskIds);

		if (this.board.workArchive?.tasks) {
			this.board.workArchive.tasks = this.board.workArchive.tasks.filter((task) => !idSet.has(task.id));
		}
		if (this.board.personalArchive?.tasks) {
			this.board.personalArchive.tasks = this.board.personalArchive.tasks.filter(
				(task) => !idSet.has(task.id),
			);
		}
	}

	private moveTask(
		taskId: string,
		fromColumnId: string,
		toColumnId: string,
		targetIndex: number,
	): void {
		const fromColumn = this.getRawColumn(fromColumnId);
		const toColumn = this.getRawColumn(toColumnId);
		if (!fromColumn || !toColumn) return;

		const taskIndex = fromColumn.tasks.findIndex((t) => t.id === taskId);
		if (taskIndex === -1) return;

		if (fromColumnId === toColumnId && taskIndex === targetIndex) return;

		const [task] = fromColumn.tasks.splice(taskIndex, 1);
		if (!task) return;

		if (fromColumnId === toColumnId) {
			if (targetIndex >= 0 && targetIndex <= toColumn.tasks.length) {
				toColumn.tasks.splice(targetIndex, 0, task);
			} else {
				toColumn.tasks.push(task);
			}
		} else {
			toColumn.tasks.unshift(task);
		}
	}

	// ==================== 分类操作 ====================

	private addColumn(title: string): void {
		const columns = this.getRawColumns();
		const maxOrder = columns.reduce((max, c) => Math.max(max, c.order ?? 0), -1);

		const newCol: Column = {
			id: `col_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
			title,
			order: maxOrder + 1,
			tasks: [],
		};

		columns.push(newCol);
		this.settings.activeColumnId = newCol.id;
	}

	private renameColumn(columnId: string, newTitle: string): void {
		const column = this.getRawColumn(columnId);
		if (column) {
			column.title = newTitle;
		}
	}

	private deleteColumn(columnId: string, moveTasks: boolean): void {
		const columns = this.getRawColumns();
		if (columns.length <= 1) return; // 至少保留一个

		const idx = columns.findIndex((c) => c.id === columnId);
		if (idx === -1) return;

		const column = columns[idx];
		if (!column) return;

		if (moveTasks && column.tasks.length > 0) {
			// 将任务移到第一个非当前的分类
			const target = columns.find((c) => c.id !== columnId);
			if (target) {
				target.tasks.push(...column.tasks);
			}
		}

		columns.splice(idx, 1);

		// 如果删的是当前选中的，切换到第一个
		if (this.settings.activeColumnId === columnId) {
			this.settings.activeColumnId = columns[0]?.id ?? '';
		}
	}

	private reorderColumns(columnIds: string[]): void {
		const columns = this.getRawColumns();
		for (let i = 0; i < columnIds.length; i++) {
			const col = columns.find((c) => c.id === columnIds[i]);
			if (col) {
				col.order = i;
			}
		}
	}

	private ensureActiveColumn(): void {
		const columns = this.getCurrentColumns();
		if (!columns.some((c) => c.id === this.settings.activeColumnId)) {
			this.settings.activeColumnId = columns[0]?.id ?? '';
		}
	}

	// ==================== 内部辅助 ====================

	/** 获取当前视图的原始列数组引用（不排序，用于修改） */
	private getRawColumns(): Column[] {
		const viewData = this.board[this.settings.currentView];
		return viewData?.columns ?? [];
	}

	/** 获取原始列引用（用于修改） */
	private getRawColumn(columnId: string): Column | undefined {
		return this.getRawColumns().find((c) => c.id === columnId);
	}

	private getOrCreateArchive(): ArchiveData {
		const archiveKey = this.settings.currentView === 'work' ? 'workArchive' : 'personalArchive';
		const archive = (this.board[archiveKey] ??= { tasks: [] });
		return archive;
	}

	/** 确保旧数据中的列有 order 字段 */
	private ensureColumnOrder(board: BoardData): BoardData {
		const ensureView = (columns: Column[]): void => {
			for (let i = 0; i < columns.length; i++) {
				const col = columns[i];
				if (col && col.order === undefined) {
					col.order = i;
				}
			}
		};
		if (board.work?.columns) ensureView(board.work.columns);
		if (board.personal?.columns) ensureView(board.personal.columns);
		board.workArchive ??= { tasks: [] };
		board.personalArchive ??= { tasks: [] };
		return board;
	}

	private updateSettings(payload?: Record<string, unknown>): void {
		if (!payload) return;

		const partial = payload as Partial<PluginSettings>;

		if (partial.currentView !== undefined) this.settings.currentView = partial.currentView;
		if (partial.activeColumnId !== undefined) this.settings.activeColumnId = partial.activeColumnId;
		if (partial.showArchive !== undefined) this.settings.showArchive = partial.showArchive;
		if (partial.customIcon !== undefined) this.settings.customIcon = partial.customIcon;
		if (partial.schemaVersion !== undefined) this.settings.schemaVersion = partial.schemaVersion;

		if (partial.work) {
			this.settings.work = { ...this.settings.work, ...partial.work };
		}
		if (partial.personal) {
			this.settings.personal = { ...this.settings.personal, ...partial.personal };
		}
		if (partial.archive) {
			this.settings.archive = { ...this.settings.archive, ...partial.archive };
		}
	}

	// ==================== 持久化 ====================

	private scheduleSave(): void {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}
		this.saveTimeout = setTimeout(() => {
			void this.plugin.persistData();
			this.saveTimeout = null;
		}, PERFORMANCE.SAVE_DEBOUNCE);
	}

	flushPendingSave(): void {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
			void this.plugin.persistData();
		}
	}

	cancelPendingSave(): void {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
	}

	async saveNow(): Promise<void> {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
		await this.plugin.persistData();
	}

	destroy(): void {
		this.listeners.clear();
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
	}
}
