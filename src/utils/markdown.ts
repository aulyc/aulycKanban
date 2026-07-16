import type { ArchiveData, Column, Task, TaskView, ViewKind } from '../types';
import { t } from '../i18n';
import { ARCHIVE_UNCATEGORIZED_ID } from '../constants';
import { formatDateTime, formatDateTimeMinute } from './datetime';
import { getArchivedAtIso, getArchivedAtTime } from './task';

function metadata(kind: 'view' | 'column' | 'task', id: string): string {
	const safeId = Array.from(id)
		.map((character) => {
			if (/^[A-Za-z0-9_.]$/.test(character)) return character;
			return `%${character.codePointAt(0)?.toString(16).toUpperCase() ?? '0'}`;
		})
		.join('');
	return `<!-- aulyckanban:${kind}=${safeId} -->`;
}

function sortedColumns(view: TaskView): Column[] {
	return [...view.columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * 生成看板 Markdown 内容
 * 已完成任务已归档到单独文件，这里只展示未完成任务
 */
export function generateMarkdown(columns: Column[]): string {
	const now = formatDateTime(new Date());

	let md = `> ${t('md.syncTime')}：${now}\n\n`;

	// 统计
	let totalTasks = 0;

	for (const column of columns) {
		totalTasks += (column.tasks ?? []).length;
	}

	md += `## ${t('md.stats')}\n\n`;
	md += `- ${t('md.totalTasks')}：${totalTasks}\n\n`;

	// 分列输出（只输出未完成任务）
	for (const column of columns) {
		const tasks = column.tasks ?? [];

		md += `## ${column.title}\n\n`;

		if (tasks.length > 0) {
			for (const task of tasks) {
				md += `- [ ] ${task.content}\n`;
			}
			md += '\n';
		} else {
			md += `*${t('md.noTasks')}*\n\n`;
		}
	}

	return md;
}

/** 生成包含全部任务类型、象限和归档任务的单一汇总笔记。 */
export function generateAggregateMarkdown(
	views: readonly TaskView[],
	archives: Readonly<Record<ViewKind, ArchiveData>>,
): string {
	const orderedViews = [...views].sort((a, b) => a.order - b.order);
	const activeTotal = orderedViews.reduce(
		(total, view) =>
			total + view.columns.reduce((viewTotal, column) => viewTotal + column.tasks.length, 0),
		0,
	);
	const archiveTotal = orderedViews.reduce(
		(total, view) => total + (archives[view.id]?.tasks.length ?? 0),
		0,
	);

	let md = `> ${t('md.syncTime')}：${formatDateTime(new Date())}\n\n`;
	md += `## ${t('md.stats')}\n\n`;
	md += `- ${t('md.totalTasks')}：${activeTotal}\n`;
	md += `- ${t('md.archiveTotal')}：${archiveTotal}\n\n`;
	md += `## ${t('md.activeSection')}\n\n`;

	for (const view of orderedViews) {
		md += `### ${view.title} ${metadata('view', view.id)}\n\n`;
		for (const column of sortedColumns(view)) {
			md += `#### ${column.title} ${metadata('column', column.id)}\n\n`;
			if (column.tasks.length === 0) {
				md += `*${t('md.noTasks')}*\n\n`;
				continue;
			}
			for (const task of column.tasks) md += `- [ ] ${task.content} ${metadata('task', task.id)}\n`;
			md += '\n';
		}
	}

	md += `## ${t('md.archiveSection')}\n\n`;
	if (archiveTotal === 0) return `${md}*${t('archive.empty')}*\n`;

	for (const view of orderedViews) {
		const tasks = archives[view.id]?.tasks ?? [];
		if (tasks.length === 0) continue;
		md += `### ${view.title} ${metadata('view', view.id)}\n\n`;
		md += renderAggregateArchive(tasks, view);
	}
	return md;
}

function renderAggregateArchive(tasks: readonly Task[], view: TaskView): string {
	const columns = sortedColumns(view);
	const grouped = new Map<string, Task[]>(columns.map((column) => [column.id, []]));
	grouped.set(ARCHIVE_UNCATEGORIZED_ID, []);
	for (const task of tasks) {
		const key =
			task.sourceColumnId && grouped.has(task.sourceColumnId)
				? task.sourceColumnId
				: ARCHIVE_UNCATEGORIZED_ID;
		grouped.get(key)?.push(task);
	}

	let md = '';
	const render = (title: string, columnId: string, columnTasks: Task[]): void => {
		if (columnTasks.length === 0) return;
		md += `#### ${title} ${metadata('column', columnId)}\n\n`;
		for (const task of [...columnTasks].sort(
			(a, b) => getArchivedAtTime(b) - getArchivedAtTime(a),
		)) {
			const time = formatDateTimeMinute(getArchivedAtIso(task));
			md += `- [x] ${task.content}  *(${t('archive.archivedAt')} ${time})* ${metadata('task', task.id)}\n`;
		}
		md += '\n';
	};
	for (const column of columns) render(column.title, column.id, grouped.get(column.id) ?? []);
	render(t('archive.other'), ARCHIVE_UNCATEGORIZED_ID, grouped.get(ARCHIVE_UNCATEGORIZED_ID) ?? []);
	return md;
}
