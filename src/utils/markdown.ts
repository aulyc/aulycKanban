import type { Column } from '../types';
import { t } from '../i18n';
import { formatDateTime } from './datetime';

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
