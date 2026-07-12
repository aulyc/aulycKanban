import type { Action, ActionType, ArchiveData, BoardData, Column, PluginSettings, Task, TaskView, ViewKind } from './types';
import { getDefaultBoardData, ID_PREFIX, PERFORMANCE } from './constants';
import type KanbanPlugin from './main';
import { synchronizeSharedColumnDefinitions } from './services/sharedColumns';

type Listener = () => void;

const DATA_MUTATION_ACTIONS: ReadonlySet<ActionType> = new Set([
	'ADD_TASK', 'EDIT_TASK', 'DELETE_TASK', 'TOGGLE_TASK',
	'ADD_VIEW', 'ADD_COLUMN', 'RENAME_COLUMN', 'DELETE_COLUMN', 'REORDER_COLUMNS',
	'RESTORE_TASK', 'DELETE_ARCHIVE_TASKS', 'SET_BOARD_DATA', 'CLEAR_ALL_DATA',
]);

const PERSIST_ACTIONS: ReadonlySet<ActionType> = new Set([
	...DATA_MUTATION_ACTIONS,
	'UPDATE_SETTINGS',
]);

/** 防抖保存失败后的最大自动重试次数，避免磁盘永久不可写时无限循环 */
const MAX_SAVE_RETRIES = 2;

export class KanbanStore {
	private readonly settings: PluginSettings;
	private board: BoardData;
	private readonly plugin: KanbanPlugin;
	private readonly listeners = new Set<Listener>();
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;
	private saveFailureCount = 0;
	private _lastActionMutatedData = false;
	private _lastActionType: ActionType | null = null;

	constructor(settings: PluginSettings, board: BoardData, plugin: KanbanPlugin) {
		this.settings = {
			...settings,
			viewSyncTargets: { ...settings.viewSyncTargets },
			archive: { ...settings.archive },
		};
		this.board = this.prepareBoard(board);
		this.plugin = plugin;
		this.ensureCurrentView();
		this.ensureActiveColumn();
	}

	getSettings(): Readonly<PluginSettings> { return this.settings; }
	getBoardData(): Readonly<BoardData> { return this.board; }
	getCurrentView(): ViewKind { return this.settings.currentView; }
	getTaskViews(): TaskView[] { return [...this.board.views].sort((a, b) => a.order - b.order); }
	getView(viewId: ViewKind): TaskView | undefined { return this.board.views.find((view) => view.id === viewId); }
	getCurrentTaskView(): TaskView | undefined { return this.getView(this.settings.currentView); }
	isShowingArchive(): boolean { return this.settings.showArchive; }

	getActiveColumnId(): string {
		const columns = this.getCurrentColumns();
		return columns.some((column) => column.id === this.settings.activeColumnId)
			? this.settings.activeColumnId
			: columns[0]?.id ?? '';
	}

	getActiveColumn(): Column | undefined {
		return this.getCurrentColumns().find((column) => column.id === this.getActiveColumnId());
	}

	getCurrentColumns(): Column[] {
		return [...(this.getCurrentTaskView()?.columns ?? [])]
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	}

	getCurrentArchive(): Task[] { return this.board.archives[this.settings.currentView]?.tasks ?? []; }
	getArchive(viewId: ViewKind): Task[] { return this.board.archives[viewId]?.tasks ?? []; }

	/** 归档任务所属象限；旧数据缺少或引用已删除象限时归入第一个象限。 */
	getArchiveColumnId(task: Task): string {
		const columns = this.getCurrentColumns();
		if (task.sourceColumnId && columns.some((column) => column.id === task.sourceColumnId)) {
			return task.sourceColumnId;
		}
		return columns[0]?.id ?? '';
	}

	/** 汇总全部任务类型中指定象限的归档任务数。 */
	getArchiveTaskCount(columnId: string): number {
		return this.getTaskViews().reduce((count, view) => (
			count + this.getArchive(view.id)
				.filter((task) => this.getArchiveColumnId(task) === columnId).length
		), 0);
	}

	findTask(columnId: string, taskId: string): Task | undefined {
		return this.getCurrentColumns().find((column) => column.id === columnId)?.tasks.find((task) => task.id === taskId);
	}

	get lastActionMutatedData(): boolean { return this._lastActionMutatedData; }
	get lastActionType(): ActionType | null { return this._lastActionType; }

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void { this.listeners.forEach((listener) => listener()); }

	dispatch(action: Action): void {
		switch (action.type) {
			case 'ADD_TASK': this.addTask(action.payload.columnId, action.payload.content); break;
			case 'EDIT_TASK': this.editTask(action.payload.columnId, action.payload.taskId, action.payload.content); break;
			case 'DELETE_TASK': this.deleteTask(action.payload.columnId, action.payload.taskId); break;
			case 'TOGGLE_TASK': this.toggleTask(action.payload.columnId, action.payload.taskId); break;
			case 'SWITCH_VIEW':
				if (this.getView(action.payload.view)) this.settings.currentView = action.payload.view;
				this.settings.showArchive = false;
				this.ensureActiveColumn();
				break;
			case 'ADD_VIEW': this.addView(action.payload.title); break;
			case 'SELECT_COLUMN': this.settings.activeColumnId = action.payload.columnId; break;
			case 'ADD_COLUMN': this.addColumn(action.payload.title); break;
			case 'RENAME_COLUMN': this.renameColumn(action.payload.columnId, action.payload.title); break;
			case 'DELETE_COLUMN': this.deleteColumn(action.payload.columnId, action.payload.moveTasks ?? true); break;
			case 'REORDER_COLUMNS': this.reorderColumns(action.payload.columnIds); break;
			case 'TOGGLE_ARCHIVE_VIEW': this.settings.showArchive = !this.settings.showArchive; break;
			case 'RESTORE_TASK': this.restoreTask(action.payload.taskId); break;
			case 'DELETE_ARCHIVE_TASKS': this.deleteArchiveTasks(action.payload.taskIds); break;
			case 'SET_BOARD_DATA':
				this.board = this.prepareBoard(action.payload.board);
				this.ensureCurrentView();
				this.ensureActiveColumn();
				break;
			case 'CLEAR_ALL_DATA':
				this.board = getDefaultBoardData();
				this.ensureCurrentView();
				this.ensureActiveColumn();
				break;
			case 'UPDATE_SETTINGS': this.updateSettings(action.payload); break;
		}

		this._lastActionType = action.type;
		this._lastActionMutatedData = DATA_MUTATION_ACTIONS.has(action.type);
		this.notify();
		if (PERSIST_ACTIONS.has(action.type)) this.scheduleSave();
	}

	private addTask(columnId: string, rawContent: string): void {
		const column = this.getRawColumn(columnId);
		const content = rawContent.trim();
		if (!column || !content) return;
		const now = new Date().toISOString();
		column.tasks.unshift({
			id: this.generateId(ID_PREFIX.TASK), content, completed: false,
			createdAt: now, updatedAt: now,
		});
	}

	private editTask(columnId: string, taskId: string, rawContent: string): void {
		const task = this.findTask(columnId, taskId);
		const content = rawContent.trim();
		if (!task || !content || task.content === content) return;
		task.content = content;
		task.updatedAt = new Date().toISOString();
	}

	private deleteTask(columnId: string, taskId: string): void {
		const column = this.getRawColumn(columnId);
		if (!column) return;
		const index = column.tasks.findIndex((task) => task.id === taskId);
		if (index >= 0) column.tasks.splice(index, 1);
	}

	private toggleTask(columnId: string, taskId: string): void {
		const column = this.getRawColumn(columnId);
		const task = column?.tasks.find((candidate) => candidate.id === taskId);
		if (!column || !task) return;
		task.completed = !task.completed;
		if (!task.completed) return;
		const now = new Date().toISOString();
		task.completedAt = now;
		task.archivedAt = now;
		task.sourceColumnId = columnId;
		column.tasks.splice(column.tasks.indexOf(task), 1);
		this.getOrCreateArchive(this.settings.currentView).tasks.unshift(task);
	}

	private restoreTask(taskId: string): void {
		for (const view of this.getTaskViews()) {
			const archive = this.board.archives[view.id];
			const index = archive?.tasks.findIndex((task) => task.id === taskId) ?? -1;
			if (!archive || index < 0) continue;
			const [task] = archive.tasks.splice(index, 1);
			if (!task) return;
			task.completed = false;
			delete task.completedAt;
			delete task.archivedAt;
			const column = view.columns.find((candidate) => candidate.id === task.sourceColumnId) ?? view.columns[0];
			delete task.sourceColumnId;
			column?.tasks.unshift(task);
			return;
		}
	}

	private deleteArchiveTasks(taskIds: string[]): void {
		const ids = new Set(taskIds);
		for (const archive of Object.values(this.board.archives)) {
			archive.tasks = archive.tasks.filter((task) => !ids.has(task.id));
		}
	}

	private addView(rawTitle: string): void {
		const title = rawTitle.trim();
		if (!title) return;
		const template = this.getTaskViews()[0];
		if (!template) return;
		const id = this.generateId(ID_PREFIX.VIEW);
		this.board.views.push({
			id, title,
			order: this.board.views.reduce((max, view) => Math.max(max, view.order), -1) + 1,
			columns: template.columns.map((column) => ({ ...column, tasks: [] })),
		});
		this.board.archives[id] = { tasks: [] };
		this.settings.viewSyncTargets[id] = { filePath: '' };
		this.settings.currentView = id;
		this.settings.showArchive = false;
		this.ensureActiveColumn();
	}

	private addColumn(rawTitle: string): void {
		const title = rawTitle.trim();
		if (!title) return;
		const maxOrder = this.getCurrentColumns().reduce((max, column) => Math.max(max, column.order ?? 0), -1);
		const id = this.generateId(ID_PREFIX.COLUMN);
		for (const view of this.board.views) view.columns.push({ id, title, order: maxOrder + 1, tasks: [] });
		this.settings.activeColumnId = id;
	}

	private renameColumn(columnId: string, rawTitle: string): void {
		const title = rawTitle.trim();
		if (!title) return;
		for (const view of this.board.views) {
			const column = view.columns.find((candidate) => candidate.id === columnId);
			if (column) column.title = title;
		}
	}

	private deleteColumn(columnId: string, moveTasks: boolean): void {
		if (this.getCurrentColumns().length <= 1) return;
		for (const view of this.board.views) {
			const index = view.columns.findIndex((column) => column.id === columnId);
			if (index < 0) continue;
			const column = view.columns[index];
			const target = [...view.columns]
				.filter((candidate) => candidate.id !== columnId)
				.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
			if (moveTasks && target && column) target.tasks.push(...column.tasks);
			view.columns.splice(index, 1);
			for (const task of this.board.archives[view.id]?.tasks ?? []) {
				if (task.sourceColumnId !== columnId) continue;
				if (moveTasks && target) task.sourceColumnId = target.id;
				else delete task.sourceColumnId;
			}
		}
		if (this.settings.activeColumnId === columnId) this.ensureActiveColumn();
	}

	private reorderColumns(columnIds: string[]): void {
		for (const view of this.board.views) {
			columnIds.forEach((id, order) => {
				const column = view.columns.find((candidate) => candidate.id === id);
				if (column) column.order = order;
			});
		}
	}

	private getRawColumns(): Column[] { return this.getCurrentTaskView()?.columns ?? []; }
	private getRawColumn(columnId: string): Column | undefined { return this.getRawColumns().find((column) => column.id === columnId); }
	private getOrCreateArchive(viewId: ViewKind): ArchiveData { return this.board.archives[viewId] ??= { tasks: [] }; }

	private prepareBoard(board: BoardData): BoardData {
		for (const view of board.views) {
			view.columns.forEach((column, index) => { column.order ??= index; });
			board.archives[view.id] ??= { tasks: [] };
		}
		return synchronizeSharedColumnDefinitions(board);
	}

	private ensureCurrentView(): void {
		if (!this.getView(this.settings.currentView)) this.settings.currentView = this.getTaskViews()[0]?.id ?? '';
	}

	private ensureActiveColumn(): void {
		const columns = this.getCurrentColumns();
		if (!columns.some((column) => column.id === this.settings.activeColumnId)) {
			this.settings.activeColumnId = columns[0]?.id ?? '';
		}
	}

	private updateSettings(partial: Partial<PluginSettings>): void {
		if (partial.currentView !== undefined && this.getView(partial.currentView)) this.settings.currentView = partial.currentView;
		if (partial.activeColumnId !== undefined) this.settings.activeColumnId = partial.activeColumnId;
		if (partial.showArchive !== undefined) this.settings.showArchive = partial.showArchive;
		if (partial.schemaVersion !== undefined) this.settings.schemaVersion = partial.schemaVersion;
		if (partial.saveDebounce !== undefined) this.settings.saveDebounce = partial.saveDebounce;
		if (partial.syncDebounce !== undefined) this.settings.syncDebounce = partial.syncDebounce;
		if (partial.viewSyncTargets) {
			for (const [id, target] of Object.entries(partial.viewSyncTargets)) {
				this.settings.viewSyncTargets[id] = { ...(this.settings.viewSyncTargets[id] ?? { filePath: '' }), ...target };
			}
		}
		if (partial.archive) this.settings.archive = { ...this.settings.archive, ...partial.archive };
	}

	private generateId(prefix: string): string {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	private scheduleSave(): void {
		if (this.saveTimeout) clearTimeout(this.saveTimeout);
		const debounce = this.settings.saveDebounce ?? PERFORMANCE.SAVE_DEBOUNCE;
		this.saveTimeout = setTimeout(() => {
			this.saveTimeout = null;
			this.plugin.persistData().then(
				() => { this.saveFailureCount = 0; },
				() => {
					// persistData 已向用户提示失败，这里只负责限次重试
					if (++this.saveFailureCount <= MAX_SAVE_RETRIES) this.scheduleSave();
				},
			);
		}, debounce);
	}

	async saveNow(): Promise<void> {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
		try {
			await this.plugin.persistData();
			this.saveFailureCount = 0;
		} catch (error) { this.scheduleSave(); throw error; }
	}

	destroy(): void {
		this.listeners.clear();
		if (this.saveTimeout) clearTimeout(this.saveTimeout);
		this.saveTimeout = null;
	}
}
