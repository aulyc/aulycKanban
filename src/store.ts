import type { Action, BoardData, PluginSettings, ViewKind, Task, Column, ColumnId, ArchiveData } from './types';
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
	'SET_BOARD_DATA',
	'CLEAR_ALL_DATA',
]);

/**
 * 看板状态管理
 * 单一数据源，所有 UI 通过 subscribe 监听变化
 */
export class KanbanStore {
	private settings: PluginSettings;
	private board: BoardData;
	private plugin: KanbanPlugin;
	private listeners: Set<Listener> = new Set();
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;
	private _lastActionMutatedData = false;

	constructor(settings: PluginSettings, board: BoardData, plugin: KanbanPlugin) {
		this.settings = { ...settings };
		this.board = board;
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

	/** 获取当前视图的列 */
	getCurrentColumns(): Column[] {
		const viewData = this.board[this.settings.currentView];
		return viewData?.columns ?? [];
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
				break;

			case 'TOGGLE_ARCHIVE_VIEW':
				this.settings.showArchive = !this.settings.showArchive;
				break;

			case 'RESTORE_TASK':
				this.restoreTask(action.payload?.['taskId'] as string);
				break;

			case 'SET_BOARD_DATA':
				this.board = action.payload?.['board'] as BoardData;
				break;

			case 'CLEAR_ALL_DATA':
				this.board = getDefaultBoardData();
				break;

			case 'UPDATE_SETTINGS':
				Object.assign(this.settings, action.payload);
				break;
		}

		this._lastActionMutatedData = DATA_MUTATION_ACTIONS.has(action.type);
		this.notify();
		this.scheduleSave();
	}

	/** 上一次 dispatch 是否修改了看板数据（供外部判断是否需要同步 md） */
	get lastActionMutatedData(): boolean {
		return this._lastActionMutatedData;
	}

	// ==================== 任务操作 ====================

	private addTask(columnId: string, content: string): void {
		const column = this.getCurrentColumns().find((c) => c.id === columnId);
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
		const column = this.getCurrentColumns().find((c) => c.id === columnId);
		if (!column) return;

		const index = column.tasks.findIndex((t) => t.id === taskId);
		if (index > -1) {
			column.tasks.splice(index, 1);
		}
	}

	private toggleTask(columnId: string, taskId: string): void {
		const column = this.getCurrentColumns().find((c) => c.id === columnId);
		if (!column) return;

		const task = column.tasks.find((t) => t.id === taskId);
		if (!task) return;

		task.completed = !task.completed;

		if (task.completed) {
			// 完成 -> 自动归档
			const now = new Date().toISOString();
			task.completedAt = now;
			task.archivedAt = now;
			task.sourceColumnId = columnId as ColumnId;

			// 从列中移除
			const idx = column.tasks.indexOf(task);
			if (idx > -1) {
				column.tasks.splice(idx, 1);
			}

			// 添加到归档
			this.getOrCreateArchive().tasks.unshift(task);
		} else {
			delete task.completedAt;
			delete task.archivedAt;
		}
	}

	/** 从归档恢复任务到原列 */
	private restoreTask(taskId: string): void {
		const archive = this.getOrCreateArchive();
		const idx = archive.tasks.findIndex((t) => t.id === taskId);
		if (idx === -1) return;

		const task = archive.tasks[idx];
		if (!task) return;

		// 从归档移除
		archive.tasks.splice(idx, 1);

		// 恢复状态
		task.completed = false;
		delete task.completedAt;
		delete task.archivedAt;

		// 放回原列（如果原列存在）
		const targetColumnId = task.sourceColumnId ?? 'periodic';
		delete task.sourceColumnId;

		const column = this.getCurrentColumns().find((c) => c.id === targetColumnId);
		if (column) {
			column.tasks.unshift(task);
		} else {
			// 原列不存在，放到第一列
			const firstCol = this.getCurrentColumns()[0];
			if (firstCol) {
				firstCol.tasks.unshift(task);
			}
		}
	}

	/** 获取或创建当前视图的归档 */
	private getOrCreateArchive(): ArchiveData {
		const archiveKey = this.settings.currentView === 'work' ? 'workArchive' : 'personalArchive';
		if (!this.board[archiveKey]) {
			this.board[archiveKey] = { tasks: [] };
		}
		return this.board[archiveKey]!;
	}

	private moveTask(
		taskId: string,
		fromColumnId: string,
		toColumnId: string,
		targetIndex: number,
	): void {
		const fromColumn = this.getCurrentColumns().find((c) => c.id === fromColumnId);
		const toColumn = this.getCurrentColumns().find((c) => c.id === toColumnId);
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

	/** 只取消定时器，不执行保存（用于 onunload） */
	cancelPendingSave(): void {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
	}

	/** 完全销毁：清除所有订阅者和定时器（用于插件卸载） */
	destroy(): void {
		this.listeners.clear();
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
}
