import type {
	Action,
	ActionType,
	ArchiveData,
	BoardData,
	Column,
	PluginSettings,
	Task,
	TaskCoordinate,
	TaskView,
	ViewKind,
} from './types';
import { getDefaultBoardData, ID_PREFIX, PERFORMANCE } from './constants';
import type KanbanPlugin from './main';
import { synchronizeSharedColumnDefinitions } from './services/sharedColumns';
import {
	queryTaskRefs,
	type ColumnScope,
	type TaskRef,
	type TaskScope,
	type TaskTypeScope,
} from './utils/taskQuery';

type Listener = () => void;

/** 防抖保存失败后的最大自动重试次数，避免磁盘永久不可写时无限循环 */
const MAX_SAVE_RETRIES = 2;

export class KanbanStore {
	private readonly settings: PluginSettings;
	private board: BoardData;
	private readonly plugin: KanbanPlugin;
	private readonly listeners = new Set<Listener>();
	private saveTimeout: number | null = null;
	private saveFailureCount = 0;
	private destroyed = false;
	private _lastActionMutatedData = false;
	private _lastActionType: ActionType | null = null;
	private _lastMutatedViewId: ViewKind | null = null;
	private _lastMutatedViewIds: ViewKind[] = [];
	private taskScope: TaskScope;
	private archiveTaskTypeScope: TaskTypeScope = 'current';
	private columnScope: ColumnScope = 'current';
	private searchKeyword = '';

	constructor(settings: PluginSettings, board: BoardData, plugin: KanbanPlugin) {
		this.settings = {
			...settings,
			syncFolder: settings.syncFolder,
			viewSyncTargets: { ...settings.viewSyncTargets },
			archive: { ...settings.archive },
		};
		this.board = this.prepareBoard(board);
		this.plugin = plugin;
		this.taskScope = settings.showArchive ? 'archive' : 'current';
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
		return this.taskScope === 'archive';
	}
	isShowingAllTasks(): boolean {
		return this.getTaskTypeScope() === 'all';
	}
	isShowingAllColumns(): boolean {
		return this.columnScope === 'all';
	}
	getTaskScope(): TaskScope {
		return this.taskScope;
	}
	getTaskTypeScope(): TaskTypeScope {
		return this.taskScope === 'archive' ? this.archiveTaskTypeScope : this.taskScope;
	}
	getColumnScope(): ColumnScope {
		return this.columnScope;
	}
	getSearchKeyword(): string {
		return this.searchKeyword;
	}
	getVisibleTaskRefs(): TaskRef[] {
		return queryTaskRefs(this.board, {
			taskScope: this.taskScope,
			taskTypeScope: this.getTaskTypeScope(),
			currentViewId: this.settings.currentView,
			columnScope: this.columnScope,
			activeColumnId: this.getActiveColumnId(),
			keyword: this.searchKeyword,
		});
	}
	getTaskCountForColumn(columnId: string): number {
		return queryTaskRefs(this.board, {
			taskScope: this.taskScope,
			taskTypeScope: this.getTaskTypeScope(),
			currentViewId: this.settings.currentView,
			columnScope: 'current',
			activeColumnId: columnId,
			keyword: this.searchKeyword,
		}).length;
	}
	getVisibleTaskCount(): number {
		return queryTaskRefs(this.board, {
			taskScope: this.taskScope,
			taskTypeScope: this.getTaskTypeScope(),
			currentViewId: this.settings.currentView,
			columnScope: 'all',
			activeColumnId: this.getActiveColumnId(),
			keyword: this.searchKeyword,
		}).length;
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

	/** 按当前任务类型范围汇总指定象限的归档任务数。 */
	getArchiveTaskCount(columnId: string): number {
		const currentView = this.getCurrentTaskView();
		const views =
			this.getTaskTypeScope() === 'all' ? this.getTaskViews() : currentView ? [currentView] : [];
		return views.reduce(
			(count, view) =>
				count +
				this.getArchive(view.id).filter((task) => this.getArchiveColumnId(task) === columnId)
					.length,
			0,
		);
	}

	findTask(
		columnId: string,
		taskId: string,
		viewId: ViewKind = this.settings.currentView,
	): Task | undefined {
		return this.getRawColumns(viewId)
			.find((column) => column.id === columnId)
			?.tasks.find((task) => task.id === taskId);
	}

	get lastActionMutatedData(): boolean {
		return this._lastActionMutatedData;
	}
	get lastActionType(): ActionType | null {
		return this._lastActionType;
	}
	get lastMutatedViewId(): ViewKind | null {
		return this._lastMutatedViewId;
	}
	get lastMutatedViewIds(): readonly ViewKind[] {
		return this._lastMutatedViewIds;
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
		this.recordMutatedViews([]);
		switch (action.type) {
			case 'ADD_TASK': {
				const viewId = action.payload.viewId ?? this.settings.currentView;
				didMutateData = this.addTask(viewId, action.payload.columnId, action.payload.content);
				if (didMutateData) this.recordMutatedViews([viewId]);
				break;
			}
			case 'EDIT_TASK': {
				const viewId = action.payload.viewId ?? this.settings.currentView;
				didMutateData = this.editTask(
					viewId,
					action.payload.columnId,
					action.payload.taskId,
					action.payload.content,
				);
				if (didMutateData) this.recordMutatedViews([viewId]);
				break;
			}
			case 'DELETE_TASK': {
				const viewId = action.payload.viewId ?? this.settings.currentView;
				didMutateData = this.deleteTask(viewId, action.payload.columnId, action.payload.taskId);
				if (didMutateData) this.recordMutatedViews([viewId]);
				break;
			}
			case 'TOGGLE_TASK': {
				const viewId = action.payload.viewId ?? this.settings.currentView;
				didMutateData = this.toggleTask(viewId, action.payload.columnId, action.payload.taskId);
				if (didMutateData) this.recordMutatedViews([viewId]);
				break;
			}
			case 'MOVE_TASKS': {
				const mutatedViewIds = this.moveTasks(
					action.payload.tasks,
					action.payload.targetViewId,
					action.payload.targetColumnId,
				);
				didMutateData = mutatedViewIds.length > 0;
				if (didMutateData) this.recordMutatedViews(mutatedViewIds);
				break;
			}
			case 'SWITCH_VIEW':
				if (this.getView(action.payload.view)) this.settings.currentView = action.payload.view;
				this.taskScope = 'current';
				this.archiveTaskTypeScope = 'current';
				this.settings.showArchive = false;
				this.ensureActiveColumn();
				break;
			case 'SHOW_ALL_TASKS':
				this.taskScope = 'all';
				this.archiveTaskTypeScope = 'all';
				this.settings.showArchive = false;
				break;
			case 'SHOW_ALL_COLUMNS':
				this.columnScope = 'all';
				break;
			case 'SET_SEARCH_QUERY':
				this.searchKeyword = action.payload.keyword.trim();
				break;
			case 'ADD_VIEW':
				didMutateData = this.addView(action.payload.title);
				if (didMutateData) {
					this.taskScope = 'current';
					this.archiveTaskTypeScope = 'current';
					this.columnScope = 'current';
				}
				break;
			case 'RENAME_VIEW':
				didMutateData = this.renameView(action.payload.viewId, action.payload.title);
				break;
			case 'DELETE_VIEW':
				didMutateData = this.deleteView(action.payload.viewId);
				break;
			case 'REORDER_VIEWS':
				didMutateData = this.reorderViews(action.payload.viewIds);
				break;
			case 'SELECT_COLUMN':
				this.settings.activeColumnId = action.payload.columnId;
				this.columnScope = 'current';
				break;
			case 'ADD_COLUMN':
				didMutateData = this.addColumn(action.payload.title);
				if (didMutateData) this.columnScope = 'current';
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
				if (this.taskScope === 'archive') {
					this.taskScope = this.archiveTaskTypeScope;
				} else {
					this.archiveTaskTypeScope = this.taskScope;
					this.taskScope = 'archive';
				}
				this.settings.showArchive = this.taskScope === 'archive';
				break;
			case 'RESTORE_TASK': {
				const restoredViewId = this.restoreTask(action.payload.viewId, action.payload.taskId);
				didMutateData = restoredViewId !== null;
				if (restoredViewId !== null) this.recordMutatedViews([restoredViewId]);
				break;
			}
			case 'DELETE_ARCHIVE_TASKS':
				didMutateData =
					'tasks' in action.payload
						? this.deleteArchiveTaskRefs(action.payload.tasks)
						: this.deleteArchiveTasks(action.payload.taskIds);
				break;
			case 'SET_BOARD_DATA':
				this.board = this.prepareBoard(action.payload.board);
				this.ensureCurrentView();
				this.ensureActiveColumn();
				this.resetTaskQuery();
				didMutateData = true;
				break;
			case 'CLEAR_ALL_DATA':
				this.board = getDefaultBoardData();
				this.ensureCurrentView();
				this.ensureActiveColumn();
				this.resetTaskQuery();
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

	private addTask(viewId: ViewKind, columnId: string, rawContent: string): boolean {
		const column = this.getRawColumn(viewId, columnId);
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

	private editTask(
		viewId: ViewKind,
		columnId: string,
		taskId: string,
		rawContent: string,
	): boolean {
		const task = this.findTask(columnId, taskId, viewId);
		const content = rawContent.trim();
		if (!task || !content || task.content === content) return false;
		task.content = content;
		task.updatedAt = new Date().toISOString();
		return true;
	}

	private deleteTask(viewId: ViewKind, columnId: string, taskId: string): boolean {
		const column = this.getRawColumn(viewId, columnId);
		if (!column) return false;
		const index = column.tasks.findIndex((task) => task.id === taskId);
		if (index < 0) return false;
		column.tasks.splice(index, 1);
		return true;
	}

	private toggleTask(viewId: ViewKind, columnId: string, taskId: string): boolean {
		const column = this.getRawColumn(viewId, columnId);
		const task = column?.tasks.find((candidate) => candidate.id === taskId);
		if (!column || !task) return false;
		task.completed = !task.completed;
		if (!task.completed) return true;
		const now = new Date().toISOString();
		task.completedAt = now;
		task.archivedAt = now;
		task.sourceColumnId = columnId;
		column.tasks.splice(column.tasks.indexOf(task), 1);
		this.getOrCreateArchive(viewId).tasks.unshift(task);
		return true;
	}

	/**
	 * 先验证全部来源、目标与 ID 冲突，再一次性移动；任何无效项都不会产生部分写入。
	 */
	private moveTasks(
		tasks: readonly TaskCoordinate[],
		targetViewId?: ViewKind,
		targetColumnId?: string,
	): ViewKind[] {
		if (tasks.length === 0 || (!targetViewId && !targetColumnId)) return [];

		type MoveRecord = {
			coordinate: TaskCoordinate;
			sourceColumn: Column;
			sourceIndex: number;
			targetViewId: ViewKind;
			targetColumnId: string;
			targetColumn: Column;
			task: Task;
		};
		const coordinateKeys = new Set<string>();
		const records: MoveRecord[] = [];
		for (const coordinate of tasks) {
			const coordinateKey = `${coordinate.viewId}:${coordinate.columnId}:${coordinate.taskId}`;
			if (coordinateKeys.has(coordinateKey)) return [];
			coordinateKeys.add(coordinateKey);
			const sourceColumn = this.getRawColumn(coordinate.viewId, coordinate.columnId);
			const sourceIndex =
				sourceColumn?.tasks.findIndex((candidate) => candidate.id === coordinate.taskId) ?? -1;
			const task = sourceColumn?.tasks[sourceIndex];
			const nextViewId = targetViewId ?? coordinate.viewId;
			const nextColumnId = targetColumnId ?? coordinate.columnId;
			const targetColumn = this.getRawColumn(nextViewId, nextColumnId);
			if (!sourceColumn || sourceIndex < 0 || !task || !targetColumn) return [];
			records.push({
				coordinate,
				sourceColumn,
				sourceIndex,
				targetViewId: nextViewId,
				targetColumnId: nextColumnId,
				targetColumn,
				task,
			});
		}

		const moving = records.filter(
			(record) =>
				record.coordinate.viewId !== record.targetViewId ||
				record.coordinate.columnId !== record.targetColumnId,
		);
		if (moving.length === 0) return [];

		const leavingKeys = new Set(
			moving.map(
				(record) =>
					`${record.coordinate.viewId}:${record.coordinate.columnId}:${record.coordinate.taskId}`,
			),
		);
		const incomingKeys = new Set<string>();
		for (const record of moving) {
			const incomingKey = `${record.targetViewId}:${record.targetColumnId}:${record.task.id}`;
			if (incomingKeys.has(incomingKey)) return [];
			incomingKeys.add(incomingKey);
			const conflictingTask = record.targetColumn.tasks.find(
				(candidate) => candidate.id === record.task.id,
			);
			if (
				conflictingTask &&
				!leavingKeys.has(`${record.targetViewId}:${record.targetColumnId}:${conflictingTask.id}`)
			) {
				return [];
			}
		}

		const sourceGroups = new Map<Column, MoveRecord[]>();
		for (const record of moving) {
			const group = sourceGroups.get(record.sourceColumn) ?? [];
			group.push(record);
			sourceGroups.set(record.sourceColumn, group);
		}
		for (const [column, group] of sourceGroups) {
			for (const record of [...group].sort((a, b) => b.sourceIndex - a.sourceIndex)) {
				column.tasks.splice(record.sourceIndex, 1);
			}
		}

		const now = new Date().toISOString();
		const targetGroups = new Map<Column, MoveRecord[]>();
		for (const record of moving) {
			record.task.updatedAt = now;
			const group = targetGroups.get(record.targetColumn) ?? [];
			group.push(record);
			targetGroups.set(record.targetColumn, group);
		}
		for (const [column, group] of targetGroups) {
			column.tasks.unshift(...group.map((record) => record.task));
		}

		const affectedViewIds: ViewKind[] = [];
		for (const record of moving) {
			for (const viewId of [record.coordinate.viewId, record.targetViewId]) {
				if (!affectedViewIds.includes(viewId)) affectedViewIds.push(viewId);
			}
		}
		return affectedViewIds;
	}

	private restoreTask(viewId: ViewKind | undefined, taskId: string): ViewKind | null {
		const views = viewId
			? this.getTaskViews().filter((view) => view.id === viewId)
			: this.getTaskViews();
		for (const view of views) {
			const archive = this.board.archives[view.id];
			const index = archive?.tasks.findIndex((task) => task.id === taskId) ?? -1;
			if (!archive || index < 0) continue;
			const archivedTask = archive.tasks[index];
			if (!archivedTask) return null;
			const column =
				view.columns.find((candidate) => candidate.id === archivedTask.sourceColumnId) ??
				view.columns[0];
			if (!column) return null;
			const [task] = archive.tasks.splice(index, 1);
			if (!task) return null;
			task.completed = false;
			delete task.completedAt;
			delete task.archivedAt;
			delete task.sourceColumnId;
			column.tasks.unshift(task);
			return view.id;
		}
		return null;
	}

	private deleteArchiveTaskRefs(tasks: Array<{ viewId: ViewKind; taskId: string }>): boolean {
		let changed = false;
		for (const { viewId, taskId } of tasks) {
			const archive = this.board.archives[viewId];
			if (!archive) continue;
			const previousLength = archive.tasks.length;
			archive.tasks = archive.tasks.filter((task) => task.id !== taskId);
			if (archive.tasks.length !== previousLength) changed = true;
		}
		return changed;
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

	private reorderViews(viewIds: ViewKind[]): boolean {
		const currentIds = this.getTaskViews().map((view) => view.id);
		if (!this.isExactReorder(currentIds, viewIds)) return false;
		let changed = false;
		viewIds.forEach((id, order) => {
			const view = this.getView(id);
			if (!view || view.order === order) return;
			view.order = order;
			changed = true;
		});
		return changed;
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
		const currentIds = this.getCurrentColumns().map((column) => column.id);
		if (!this.isExactReorder(currentIds, columnIds)) return false;
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

	private isExactReorder(currentIds: readonly string[], nextIds: readonly string[]): boolean {
		return (
			currentIds.length === nextIds.length &&
			new Set(nextIds).size === nextIds.length &&
			currentIds.every((id) => nextIds.includes(id))
		);
	}

	private getRawColumns(viewId: ViewKind = this.settings.currentView): Column[] {
		return this.getView(viewId)?.columns ?? [];
	}
	private getRawColumn(viewId: ViewKind, columnId: string): Column | undefined {
		return this.getRawColumns(viewId).find((column) => column.id === columnId);
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

	private resetTaskQuery(): void {
		this.taskScope = 'current';
		this.archiveTaskTypeScope = 'current';
		this.columnScope = 'current';
		this.searchKeyword = '';
		this.settings.showArchive = false;
	}

	private updateSettings(partial: Partial<PluginSettings>): void {
		if (partial.uiLanguage !== undefined) this.settings.uiLanguage = partial.uiLanguage;
		if (partial.currentView !== undefined && this.getView(partial.currentView))
			this.settings.currentView = partial.currentView;
		if (partial.activeColumnId !== undefined) this.settings.activeColumnId = partial.activeColumnId;
		if (partial.showArchive !== undefined) this.settings.showArchive = partial.showArchive;
		if (partial.syncFolder !== undefined) this.settings.syncFolder = partial.syncFolder;
		if (partial.schemaVersion !== undefined) this.settings.schemaVersion = partial.schemaVersion;
		if (partial.saveDebounce !== undefined) this.settings.saveDebounce = partial.saveDebounce;
		if (partial.syncDebounce !== undefined) this.settings.syncDebounce = partial.syncDebounce;
		if (partial.viewSyncTargets) {
			this.settings.viewSyncTargets = Object.fromEntries(
				Object.entries(partial.viewSyncTargets).map(([id, target]) => [id, { ...target }]),
			);
		}
		if (partial.archive) this.settings.archive = { ...this.settings.archive, ...partial.archive };
	}

	private generateId(prefix: string): string {
		return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	private recordMutatedViews(viewIds: readonly ViewKind[]): void {
		this._lastMutatedViewIds = [...new Set(viewIds)];
		this._lastMutatedViewId =
			this._lastMutatedViewIds.length === 1 ? (this._lastMutatedViewIds[0] ?? null) : null;
	}

	private scheduleSave(isRetry = false): void {
		if (this.destroyed) return;
		if (!isRetry) this.saveFailureCount = 0;
		if (this.saveTimeout) window.clearTimeout(this.saveTimeout);
		const debounce = this.settings.saveDebounce ?? PERFORMANCE.SAVE_DEBOUNCE;
		this.saveTimeout = window.setTimeout(() => {
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
			window.clearTimeout(this.saveTimeout);
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
		if (this.saveTimeout) window.clearTimeout(this.saveTimeout);
		this.saveTimeout = null;
		// Obsidian 的 onunload 不等待异步清理；这里先同步发起最后一次写入，避免丢失防抖窗口内的数据。
		if (hasPendingSave) void this.plugin.persistData().catch(() => undefined);
	}
}
