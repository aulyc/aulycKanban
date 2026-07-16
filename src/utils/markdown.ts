import type { TaskView } from '../types';
import { t } from '../i18n';
import { formatDateTime } from './datetime';

export function syncMetadata(kind: 'view' | 'archive', id?: string): string {
	if (kind === 'archive') return '<!-- aulyckanban:archive -->';
	const safeId = Array.from(id ?? '')
		.map((character) => {
			if (/^[A-Za-z0-9_.]$/.test(character)) return character;
			return `%${character.codePointAt(0)?.toString(16).toUpperCase() ?? '0'}`;
		})
		.join('');
	return `<!-- aulyckanban:view=${safeId} -->`;
}

/** 生成单个任务类型的 Markdown，同步身份始终使用稳定 ID。 */
export function generateMarkdown(view: TaskView): string {
	const columns = [...view.columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	let md = `${syncMetadata('view', view.id)}\n`;
	md += `> ${t('md.syncTime')}：${formatDateTime(new Date())}\n\n`;

	const totalTasks = columns.reduce((total, column) => total + column.tasks.length, 0);
	md += `## ${t('md.stats')}\n\n`;
	md += `- ${t('md.totalTasks')}：${totalTasks}\n\n`;

	for (const column of columns) {
		md += `## ${column.title}\n\n`;
		if (column.tasks.length === 0) {
			md += `*${t('md.noTasks')}*\n\n`;
			continue;
		}
		for (const task of column.tasks) md += `- [ ] ${task.content}\n`;
		md += '\n';
	}

	return md;
}
