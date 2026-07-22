import type { ArchiveData, BoardData, Column, Task, TaskView } from '../types';
import { getDefaultBoardData } from '../constants';
import { t } from '../i18n';
import { synchronizeSharedColumnDefinitions } from './sharedColumns';

const FALLBACK_CREATED_AT = '1970-01-01T00:00:00.000Z';
const OPTIONAL_TASK_STRINGS = ['updatedAt', 'completedAt', 'archivedAt', 'sourceColumnId'] as const;

type UnknownRecord = Record<string, unknown>;

export interface ImportedBoardDuplicateId {
	field: 'viewId' | 'columnId' | 'taskId';
	id: string;
}

function isRecord(value: unknown): value is UnknownRecord {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function findDuplicateRecordId(values: readonly unknown[]): string | null {
	const seen = new Set<string>();
	for (const value of values) {
		if (!isRecord(value) || typeof value['id'] !== 'string') continue;
		const id = value['id'];
		if (seen.has(id)) return id;
		seen.add(id);
	}
	return null;
}

function collectViewTasks(value: unknown): unknown[] {
	if (!isRecord(value) || !Array.isArray(value['columns'])) return [];
	return value['columns'].flatMap((column) =>
		isRecord(column) && Array.isArray(column['tasks']) ? column['tasks'] : [],
	);
}

function collectArchiveTasks(value: unknown): unknown[] {
	return isRecord(value) && Array.isArray(value['tasks']) ? value['tasks'] : [];
}

function findViewDuplicateId(view: unknown, archive: unknown): ImportedBoardDuplicateId | null {
	if (!isRecord(view) || !Array.isArray(view['columns'])) return null;
	const columnId = findDuplicateRecordId(view['columns']);
	if (columnId !== null) return { field: 'columnId', id: columnId };
	const taskId = findDuplicateRecordId([
		...collectViewTasks(view),
		...collectArchiveTasks(archive),
	]);
	return taskId === null ? null : { field: 'taskId', id: taskId };
}

/** Find ambiguous entity identities before migration can merge or discard imported data. */
export function findImportedBoardDuplicateId(raw: unknown): ImportedBoardDuplicateId | null {
	if (!isRecord(raw)) return null;
	if (Array.isArray(raw['views'])) {
		const viewId = findDuplicateRecordId(raw['views']);
		if (viewId !== null) return { field: 'viewId', id: viewId };
		const archives = isRecord(raw['archives']) ? raw['archives'] : {};
		for (const view of raw['views']) {
			const id = isRecord(view) && typeof view['id'] === 'string' ? view['id'] : '';
			const duplicate = findViewDuplicateId(view, archives[id]);
			if (duplicate) return duplicate;
		}
		return null;
	}
	if (raw['work'] && raw['personal']) {
		return (
			findViewDuplicateId(raw['work'], raw['workArchive']) ??
			findViewDuplicateId(raw['personal'], raw['personalArchive'])
		);
	}
	if (Array.isArray(raw['columns'])) {
		return findViewDuplicateId({ columns: raw['columns'] }, undefined);
	}
	return null;
}

export function isMigratableBoardData(data: Record<string, unknown>): boolean {
	return (
		Array.isArray(data['views']) ||
		Boolean(data['work'] && data['personal']) ||
		Array.isArray(data['columns'])
	);
}

function isValidViewData(value: unknown): value is UnknownRecord & { columns: unknown[] } {
	if (!isRecord(value)) return false;
	const columns = value['columns'];
	return (
		Array.isArray(columns) &&
		columns.every((column) => {
			if (!isRecord(column)) return false;
			return (
				typeof column['id'] === 'string' &&
				typeof column['title'] === 'string' &&
				Array.isArray(column['tasks'])
			);
		})
	);
}

function sanitizeTask(value: unknown): Task | null {
	if (!isRecord(value)) return null;
	const id = value['id'];
	const rawContent = value['content'];
	if (typeof id !== 'string' || !id.trim()) return null;
	if (!['string', 'number', 'boolean'].includes(typeof rawContent)) return null;

	const task: Task = {
		id,
		content: String(rawContent),
		completed: typeof value['completed'] === 'boolean' ? value['completed'] : false,
		createdAt:
			typeof value['createdAt'] === 'string' && value['createdAt']
				? value['createdAt']
				: FALLBACK_CREATED_AT,
	};
	for (const field of OPTIONAL_TASK_STRINGS) {
		const candidate = value[field];
		if (typeof candidate === 'string') task[field] = candidate;
	}
	return task;
}

function sanitizeColumns(columns: unknown[]): Column[] {
	return columns.flatMap((value, index): Column[] => {
		if (!isRecord(value)) return [];
		const id = value['id'];
		const title = value['title'];
		const tasks = value['tasks'];
		if (
			typeof id !== 'string' ||
			!id.trim() ||
			typeof title !== 'string' ||
			!title.trim() ||
			!Array.isArray(tasks)
		)
			return [];
		return [
			{
				id,
				title,
				order: typeof value['order'] === 'number' ? value['order'] : index,
				tasks: tasks.flatMap((task): Task[] => {
					const sanitized = sanitizeTask(task);
					return sanitized ? [sanitized] : [];
				}),
			},
		];
	});
}

function sanitizeArchive(value: unknown): ArchiveData {
	if (!isRecord(value)) return { tasks: [] };
	const tasks = value['tasks'];
	if (!Array.isArray(tasks)) return { tasks: [] };
	return {
		tasks: tasks.flatMap((task): Task[] => {
			const sanitized = sanitizeTask(task);
			return sanitized ? [sanitized] : [];
		}),
	};
}

function hasOnlyValidOptionalTaskFields(task: UnknownRecord): boolean {
	if (task['completed'] !== undefined && typeof task['completed'] !== 'boolean') return false;
	if (task['createdAt'] !== undefined && typeof task['createdAt'] !== 'string') return false;
	return OPTIONAL_TASK_STRINGS.every(
		(field) => task[field] === undefined || typeof task[field] === 'string',
	);
}

function isValidImportedTask(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return (
		typeof value['id'] === 'string' &&
		Boolean(value['id'].trim()) &&
		typeof value['content'] === 'string' &&
		hasOnlyValidOptionalTaskFields(value)
	);
}

function isValidImportedColumn(value: unknown): boolean {
	if (!isRecord(value)) return false;
	const tasks = value['tasks'];
	return (
		typeof value['id'] === 'string' &&
		Boolean(value['id'].trim()) &&
		typeof value['title'] === 'string' &&
		Boolean(value['title'].trim()) &&
		Array.isArray(tasks) &&
		tasks.every(isValidImportedTask)
	);
}

function isValidImportedViewData(value: unknown): boolean {
	if (!isRecord(value)) return false;
	const columns = value['columns'];
	return Array.isArray(columns) && columns.every(isValidImportedColumn);
}

function isValidImportedArchive(value: unknown): boolean {
	if (!isRecord(value)) return false;
	const tasks = value['tasks'];
	return Array.isArray(tasks) && tasks.every(isValidImportedTask);
}

function hasValidImportedArchives(value: unknown): boolean {
	if (value === undefined) return true;
	return isRecord(value) && Object.values(value).every(isValidImportedArchive);
}

function isValidImportedBoardData(data: UnknownRecord): boolean {
	if (Array.isArray(data['views'])) {
		const views = data['views'];
		return (
			views.length > 0 &&
			views.every(
				(value) =>
					isRecord(value) &&
					typeof value['id'] === 'string' &&
					Boolean(value['id'].trim()) &&
					typeof value['title'] === 'string' &&
					Boolean(value['title'].trim()) &&
					isValidImportedViewData(value),
			) &&
			views.some(
				(value) => isRecord(value) && (value['columns'] as unknown[] | undefined)?.length,
			) &&
			hasValidImportedArchives(data['archives'])
		);
	}

	if (data['work'] && data['personal']) {
		return (
			isValidImportedViewData(data['work']) &&
			isValidImportedViewData(data['personal']) &&
			isValidImportedArchive(data['workArchive'] ?? { tasks: [] }) &&
			isValidImportedArchive(data['personalArchive'] ?? { tasks: [] })
		);
	}

	if (Array.isArray(data['columns'])) {
		return data['columns'].length > 0 && data['columns'].every(isValidImportedColumn);
	}

	return false;
}

/** Validate an entire backup before migration so an invalid element cannot partially overwrite data. */
export function migrateImportedBoardData(raw: unknown): BoardData | null {
	if (
		!isRecord(raw) ||
		!isMigratableBoardData(raw) ||
		!isValidImportedBoardData(raw) ||
		findImportedBoardDuplicateId(raw)
	)
		return null;
	return migrateBoardData(raw);
}

export function migrateBoardData(raw: unknown): BoardData {
	if (!isRecord(raw)) return getDefaultBoardData();
	const obj = raw;

	if (Array.isArray(obj['views'])) {
		const views = obj['views'].flatMap((value, index): TaskView[] => {
			if (!isRecord(value) || !isValidViewData(value)) return [];
			if (typeof value['id'] !== 'string' || typeof value['title'] !== 'string') return [];
			return [
				{
					id: value['id'],
					title: value['title'].trim() || value['id'],
					order: typeof value['order'] === 'number' ? value['order'] : index,
					columns: sanitizeColumns(value['columns']),
				},
			];
		});
		if (views.length === 0 || views.every((view) => view.columns.length === 0))
			return getDefaultBoardData();
		const rawArchives = isRecord(obj['archives']) ? obj['archives'] : {};
		const archives = Object.create(null) as Record<string, ArchiveData>;
		for (const view of views) archives[view.id] = sanitizeArchive(rawArchives[view.id]);
		return synchronizeSharedColumnDefinitions({ views, archives });
	}

	if (obj['work'] && obj['personal']) {
		if (!isValidViewData(obj['work']) || !isValidViewData(obj['personal']))
			return getDefaultBoardData();
		const views: TaskView[] = [
			{
				id: 'work',
				title: t('view.work'),
				order: 0,
				columns: sanitizeColumns(obj['work'].columns),
			},
			{
				id: 'personal',
				title: t('view.personal'),
				order: 1,
				columns: sanitizeColumns(obj['personal'].columns),
			},
		];
		return synchronizeSharedColumnDefinitions({
			views,
			archives: {
				work: sanitizeArchive(obj['workArchive']),
				personal: sanitizeArchive(obj['personalArchive']),
			},
		});
	}

	if (Array.isArray(obj['columns'])) {
		const columns = sanitizeColumns(obj['columns']);
		if (columns.length === 0) return getDefaultBoardData();
		const personalColumns = columns.map((column) => ({ ...column, tasks: [] }));
		return {
			views: [
				{ id: 'work', title: t('view.work'), order: 0, columns },
				{ id: 'personal', title: t('view.personal'), order: 1, columns: personalColumns },
			],
			archives: { work: { tasks: [] }, personal: { tasks: [] } },
		};
	}

	return getDefaultBoardData();
}
