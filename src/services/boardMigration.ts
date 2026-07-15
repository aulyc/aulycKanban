import type { ArchiveData, BoardData, Column, TaskView, ViewData } from '../types';
import { getDefaultBoardData } from '../constants';
import { t } from '../i18n';
import { synchronizeSharedColumnDefinitions } from './sharedColumns';

export function isMigratableBoardData(data: Record<string, unknown>): boolean {
	return (
		Array.isArray(data['views']) ||
		Boolean(data['work'] && data['personal']) ||
		Array.isArray(data['columns'])
	);
}

function isValidViewData(value: unknown): value is ViewData {
	if (!value || typeof value !== 'object') return false;
	const columns = (value as Record<string, unknown>)['columns'];
	return (
		Array.isArray(columns) &&
		columns.every((column) => {
			if (!column || typeof column !== 'object') return false;
			const candidate = column as Record<string, unknown>;
			return (
				typeof candidate['id'] === 'string' &&
				typeof candidate['title'] === 'string' &&
				Array.isArray(candidate['tasks'])
			);
		})
	);
}

function sanitizeColumns(columns: Column[]): Column[] {
	return columns
		.filter((column) => column.id && column.title && Array.isArray(column.tasks))
		.map((column, index) => ({ ...column, order: column.order ?? index }));
}

function sanitizeArchive(value: unknown): ArchiveData {
	if (!value || typeof value !== 'object') return { tasks: [] };
	const tasks = (value as Record<string, unknown>)['tasks'];
	return { tasks: Array.isArray(tasks) ? (tasks as ArchiveData['tasks']) : [] };
}

export function migrateBoardData(raw: unknown): BoardData {
	if (!raw || typeof raw !== 'object') return getDefaultBoardData();
	const obj = raw as Record<string, unknown>;

	if (Array.isArray(obj['views'])) {
		const views = (obj['views'] as unknown[]).flatMap((value, index): TaskView[] => {
			if (!value || typeof value !== 'object' || !isValidViewData(value)) return [];
			const candidate = value as unknown as Record<string, unknown>;
			if (typeof candidate['id'] !== 'string' || typeof candidate['title'] !== 'string') return [];
			return [
				{
					id: candidate['id'],
					title: candidate['title'].trim() || candidate['id'],
					order: typeof candidate['order'] === 'number' ? candidate['order'] : index,
					columns: sanitizeColumns(candidate['columns'] as Column[]),
				},
			];
		});
		if (views.length === 0 || views.every((view) => view.columns.length === 0))
			return getDefaultBoardData();
		const rawArchives =
			obj['archives'] && typeof obj['archives'] === 'object'
				? (obj['archives'] as Record<string, unknown>)
				: {};
		const archives: Record<string, ArchiveData> = {};
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
				columns: sanitizeColumns((obj['work'] as ViewData).columns),
			},
			{
				id: 'personal',
				title: t('view.personal'),
				order: 1,
				columns: sanitizeColumns((obj['personal'] as ViewData).columns),
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
		const columns = sanitizeColumns(obj['columns'] as Column[]);
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
