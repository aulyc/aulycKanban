import type {
	Action,
	ActionType,
	ArchiveData,
	BoardData,
	Column,
	PluginSettings,
	Task,
	TaskView,
	ViewKind,
} from './types';
import { getDefaultBoardData, ID_PREFIX, PERFORMANCE } from './constants';
import type KanbanPlugin from './main';
import { synchronizeSharedColumnDefinitions } from './services/sharedColumns';

type Listener = () => void;

/** 防抖保存失败后的最大自动重试次数，避免磁盘永久不可写时无限循环 */
const MAX_SAVE_RETRIES = 2;

export class KanbanStore {
	private readonly settings: PluginSettings;
	private board: BoardData;
	private readonly plugin: KanbanPlugin;
	private readonly listeners = new Set<Listener>();
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;
	private saveFailureCount = 0;
	private destroyed = false;
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

	getSettings(): Readonly<PluginSettings> {
		return this.settings;
	}
	getBoardData(): Readonly<BoardData> {
		return this.board;
	}
	getCurrentView(): ViewKind {
		return this.settings.currentView;
	}
	getTaskViews(): TaskView[] {
		return [...this.board.views].sort((a, b) => a.order - b.order);
	}
	getView(viewId: ViewKind): TaskView | undefined {
		return this.board.views.find((view) => view.id === viewId);
	}
	getCurrentTaskView(): TaskView | undefined {
		return this.getView(this.settings.currentView);
	}
	isShowingArchive(): boolean {
		return this.settings.showArchive;
	}

	getActiveColumnId(): string {
		const columns = this.getCurrentColumns();
		return columns.some((column) => column.id === this.settings.activeColumnId)
			? this.settings.activeColumnId
			: (columns[0]?.id ?? '');
	}

	getActiveColumn(): Column | undefined {
		return this.getCurrentColumns().find((column) => column.id === this.getActiveColumnId());
	}

	getCurrentColumns(): Column[] {
		return [...(this.getCurrentTaskView()?.columns ?? [])].sort(
			(a, b) => (a.order ?? 0) - (b.order ?? 0),
		);
	}

	getCurrentArchive(): Task[] {
		return this.board.archives[this.settings.currentView]?.tasks ?? [];
	}
	getArchive(viewId: ViewKind): Task[] {
		return this.board.archives[viewId]?.tasks ?? [];
	}

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
		return this.getTaskViews().reduce(
			(count, view) =>
				count +
				this.getArchive(view.id).filter((task) => this.getArchiveColumnId(task) === columnId)
					.length,
			0,
		);
	}

	findTask(columnId: string, taskId: string): Task | undefined {
		return this.getCurrentColumns()
			.find((column) => column.id === columnId)
			?.tasks.find((task) => task.id === taskId);
	}

	get lastActionMutatedData(): boolean {
		return this._lastActionMutatedData;
	}
	get lastActionType(): ActionType | null {
		return this._lastActionType;
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		this.listeners.forEach((listener) => listener());
	}

	dispatch(action: Action): void {
		let didMutateData = false;
		let shouldPersist = false;
		switch (action.type) {
			case 'ADD_TASK':
				didMutateData = this.addTask(action.payload.columnId, action.payload.content);
				break;
			case 'EDIT_TASK':
				didMutateData = this.editTask(
					action.payload.columnId,
					action.payload.taskId,
					action.payload.content,
				);
				break;
			case 'DELETE_TASK':
				didMutateData = this.deleteTask(action.payload.columnId, action.payload.taskId);
				break;
			case 'TOGGLE_TASK':
				didMutateData = this.toggleTask(action.payload.columnId, action.payload.taskId);
				break;
			case 'SWITCH_VIEW':
				if (this.getView(action.payload.view)) this.settings.currentView = action.payload.view;
				this.settings.showArchive = false;
				this.ensureActiveColumn();
				break;
			case 'ADD_VIEW':
				didMutateData = this.addView(action.payload.title);
				break;
			case 'RENAME_VIEW':
				didMutateData = this.renameView(action.payload.viewId, action.payload.title);
				break;
			case 'DELETE_VIEW':
				didMutateData = this.deleteView(action.payload.viewId);
				break;
			case 'SELECT_COLUMN':
				this.settings.activeColumnId = action.payload.columnId;
				break;
			case 'ADD_COLUMN':
				didMutateData = this.addColumn(action.payload.title);
				break;
			case 'RENAME_COLUMN':
				didMutateData = this.renameColumn(action.payload.columnId, action.payload.title);
				break;
			case 'DELETE_COLUMN':
				didMutateData = this.deleteColumn(
					action.payload.columnId,
					action.payload.moveTasks ?? true,
				);
				break;
			case 'REORDER_COLUMNS':
				didMutateData = this.reorderColumns(action.payload.columnIds);
				break;
			case 'TOGGLE_ARCHIVE_VIEW':
				this.settings.showArchive = !this.settings.showArchive;
				break;
			case 'RESTORE_TASK':
				didMutateData = this.restoreTask(action.payload.taskId);
				break;
			case 'DELETE_ARCHIVE_TASKS':
				didMutateData = this.deleteArchiveTasks(action.payload.taskIds);
				break;
			case 'SET_BOARD_DATA':
				this.board = this.prepareBoard(action.payload.board);
				this.ensureCurrentView();
				this.ensureActiveColumn();
				didMutateData = true;
				break;
			case 'CLEAR_ALL_DATA':
				this.board = getDefaultBoardData();
				this.ensureCurrentView();
				this.ensureActiveColumn();
				didMutateData = true;
				break;
			case 'UPDATE_SETTINGS':
				this.updateSettings(action.payload);
				shouldPersist = true;
				break;
		}

		this._lastActionType = action.type;
		this._lastActionMutatedData = didMutateData;
		this.notify();
		if (didMutateData || shouldPersist) this.scheduleSave();
	}

	private addTask(columnId: string, rawContent: string): boolean {
		const column = this.getRawColumn(columnId);
		const content = rawContent.trim();
		if (!column || !content) return false;
		const now = new Date().toISOString();
		column.tasks.unshift({
			id: this.generateId(ID_PREFIX.TASK),
			content,
			completed: false,
			createdAt: now,
			updatedAt: now,
		});
		return true;
	}

	private editTask(columnId: string, taskId: string, rawContent: string): boolean {
		const task = this.findTask(columnId, taskId);
		const content = rawContent.trim();
		if (!task || !content || task.content === content) return false;
		task.content = content;
		task.updatedAt = new Date().toISOString();
		return true;
	}

	private deleteTask(columnId: string, taskId: string): boolean {
		const column = this.getRawColumn(columnId);
		if (!column) return false;
		const index = column.tasks.findIndex((task) => task.id === taskId);
		if (index < 0) return false;
		column.tasks.splice(index, 1);
		return true;
	}

	private toggleTask(columnId: string, taskId: string): boolean {
		const column = this.getRawColumn(columnId);
		const task = column?.tasks.find((candidate) => candidate.id === taskId);
		if (!column || !task) return false;
		task.completed = !task.completed;
		if (!task.completed) return true;
		const now = new Date().toISOString();
		task.completedAt = now;
		task.archivedAt = now;
		task.sourceColumnId = columnId;
		column.tasks.splice(column.tasks.indexOf(task), 1);
		this.getOrCreateArchive(this.settings.currentView).tasks.unshift(task);
		return true;
	}

	private restoreTask(taskId: string): boolean {
		for (const view of this.getTaskViews()) {
			const archive = this.board.archives[view.id];
			const index = archive?.tasks.findIndex((task) => task.id === taskId) ?? -1;
			if (!archive || index < 0) continue;
			const archivedTask = archive.tasks[index];
			if (!archivedTask) return false;
			const column =
				view.columns.find((candidate) => candidate.id === archivedTask.sourceColumnId) ??
				view.columns[0];
			if (!column) return false;
			const [task] = archive.tasks.splice(index, 1);
			if (!task) return false;
			task.completed = false;
			delete task.completedAt;
			delete task.archivedAt;
			delete task.sourceColumnId;
			column.tasks.unshift(task);
			return true;
		}
		return false;
	}

	private deleteArchiveTasks(taskIds: string[]): boolean {
		const ids = new Set(taskIds);
		if (ids.size === 0) return false;
		let changed = false;
		for (const archive of Object.values(this.board.archives)) {
			const previousLength = archive.tasks.length;
			archive.tasks = archive.tasks.filter((task) => !ids.has(task.id));
			if (archive.tasks.length !== previousLength) changed = true;
		}
		return changed;
	}

	private addView(rawTitle: string): boolean {
		const title = rawTitle.trim();
		if (!title) return false;
		const template = this.getTaskViews()[0];
		if (!template) return false;
		const id = this.generateId(ID_PREFIX.VIEW);
		this.board.views.push({
			id,
			title,
			order: this.board.views.reduce((max, view) => Math.max(max, view.order), -1) + 1,
			columns: template.columns.map((column) => ({ ...column, tasks: [] })),
		});
		this.board.archives[id] = { tasks: [] };
		this.settings.viewSyncTargets[id] = { filePath: '' };
		this.settings.currentView = id;
		this.settings.showArchive = false;
		this.ensureActiveColumn();
		return true;
	}

	private renameView(viewId: ViewKind, rawTitle: string): boolean {
		const view = this.getView(viewId);
		const title = rawTitle.trim();
		if (!view || !title || view.title === title) return false;
		view.title = title;
		return true;
	}

	private deleteView(viewId: ViewKind): boolean {
		if (this.board.views.length <= 1) return false;
		const index = this.board.views.findIndex((view) => view.id === viewId);
		if (index < 0) return false;

		this.board.views.splice(index, 1);
		delete this.board.archives[viewId];
		delete this.settings.viewSyncTargets[viewId];
		this.getTaskViews().forEach((view, order) => {
			view.order = order;
		});
		this.ensureCurrentView();
		this.ensureActiveColumn();
		return true;
	}

	private addColumn(rawTitle: string): boolean {
		const title = rawTitle.trim();
		if (!title) return false;
		const maxOrder = this.getCurrentColumns().reduce(
			(max, column) => Math.max(max, column.order ?? 0),
			-1,
		);
		const id = this.generateId(ID_PREFIX.COLUMN);
		for (const view of this.board.views)
			view.columns.push({ id, title, order: maxOrder + 1, tasks: [] });
		this.settings.activeColumnId = id;
		return true;
	}

	private renameColumn(columnId: string, rawTitle: string): boolean {
		const title = rawTitle.trim();
		if (!title) return false;
		let changed = false;
		for (const view of this.board.views) {
			const column = view.columns.find((candidate) => candidate.id === columnId);
			if (!column || column.title === title) continue;
			column.title = title;
			changed = true;
		}
		return changed;
	}

	private deleteColumn(columnId: string, moveTasks: boolean): boolean {
		if (this.getCurrentColumns().length <= 1) return false;
		let changed = false;
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
			changed = true;
		}
		if (this.settings.activeColumnId === columnId) this.ensureActiveColumn();
		return changed;
	}

	private reorderColumns(columnIds: string[]): boolean {
		let changed = false;
		for (const view of this.board.views) {
			columnIds.forEach((id, order) => {
				const column = view.columns.find((candidate) => candidate.id === id);
				if (!column || column.order === order) return;
				column.order = order;
				changed = true;
			});
		}
		return changed;
	}

	private getRawColumns(): Column[] {
		return this.getCurrentTaskView()?.columns ?? [];
	}
	private getRawColumn(columnId: string): Column | undefined {
		return this.getRawColumns().find((column) => column.id === columnId);
	}
	private getOrCreateArchive(viewId: ViewKind): ArchiveData {
		return (this.board.archives[viewId] ??= { tasks: [] });
	}

	private prepareBoard(board: BoardData): BoardData {
		for (const view of board.views) {
			view.columns.forEach((column, index) => {
				column.order ??= index;
			});
			board.archives[view.id] ??= { tasks: [] };
		}
		return synchronizeSharedColumnDefinitions(board);
	}

	private ensureCurrentView(): void {
		if (!this.getView(this.settings.currentView))
			this.settings.currentView = this.getTaskViews()[0]?.id ?? '';
	}

	private ensureActiveColumn(): void {
		const columns = this.getCurrentColumns();
		if (!columns.some((column) => column.id === this.settings.activeColumnId)) {
			this.settings.activeColumnId = columns[0]?.id ?? '';
		}
	}

	private updateSettings(partial: Partial<PluginSettings>): void {
		if (partial.currentView !== undefined && this.getView(partial.currentView))
			this.settings.currentView = partial.currentView;
		if (partial.activeColumnId !== undefined) this.settings.activeColumnId = partial.activeColumnId;
		if (partial.showArchive !== undefined) this.settings.showArchive = partial.showArchive;
		if (partial.schemaVersion !== undefined) this.settings.schemaVersion = partial.schemaVersion;
		if (partial.saveDebounce !== undefined) this.settings.saveDebounce = partial.saveDebounce;
		if (partial.syncDebounce !== undefined) this.settings.syncDebounce = partial.syncDebounce;
		if (partial.viewSyncTargets) {
			for (const [id, target] of Object.entries(partial.viewSyncTargets)) {
				this.settings.viewSyncTargets[id] = {
					...(this.settings.viewSyncTargets[id] ?? { filePath: '' }),
					...target,
				};
			}
		}
		if (partial.archive) this.settings.archive = { ...this.settings.archive, ...partial.archive };
	}

	private generateId(prefix: string): string {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	private scheduleSave(isRetry = false): void {
		if (this.destroyed) return;
		if (!isRetry) this.saveFailureCount = 0;
		if (this.saveTimeout) clearTimeout(this.saveTimeout);
		const debounce = this.settings.saveDebounce ?? PERFORMANCE.SAVE_DEBOUNCE;
		this.saveTimeout = setTimeout(() => {
			this.saveTimeout = null;
			this.plugin.persistData(!isRetry).then(
				() => {
					this.saveFailureCount = 0;
				},
				() => this.scheduleRetry(),
			);
		}, debounce);
	}

	private scheduleRetry(): void {
		if (this.destroyed || this.saveFailureCount >= MAX_SAVE_RETRIES) return;
		this.saveFailureCount += 1;
		this.scheduleSave(true);
	}

	async saveNow(): Promise<void> {
		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
			this.saveTimeout = null;
		}
		this.saveFailureCount = 0;
		try {
			await this.plugin.persistData();
			this.saveFailureCount = 0;
		} catch (error) {
			this.scheduleRetry();
			throw error;
		}
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.listeners.clear();
		const hasPendingSave = this.saveTimeout !== null;
		if (this.saveTimeout) clearTimeout(this.saveTimeout);
		this.saveTimeout = null;
		// Obsidian 的 onunload 不等待异步清理；这里先同步发起最后一次写入，避免丢失防抖窗口内的数据。
		if (hasPendingSave) void this.plugin.persistData().catch(() => undefined);
	}
}
