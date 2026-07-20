import assert from 'node:assert/strict';
import test from 'node:test';
import markdownModule from '../src/utils/markdown.ts';

const { generateMarkdown } = markdownModule;

function task(id, content, archivedAt) {
	return {
		id,
		content,
		completed: Boolean(archivedAt),
		createdAt: '2026-01-01T00:00:00.000Z',
		...(archivedAt ? { archivedAt, sourceColumnId: 'important-not-urgent' } : {}),
	};
}

function fixtures() {
	const views = [
		{
			id: 'work',
			title: '💼 工作任务',
			order: 0,
			columns: [
				{
					id: 'important-not-urgent',
					title: '⭐ 重要不紧急',
					order: 0,
					tasks: [task('task-active', '整理方案')],
				},
			],
		},
	];
	const archives = {
		work: { tasks: [task('task-archived', '旧任务', '2026-07-16T08:00:00.000Z')] },
	};
	return { views, archives };
}

test('task-type Markdown renders current task and quadrant labels', async () => {
	const { views } = fixtures();
	const markdown = generateMarkdown(views[0]);

	assert.match(markdown, /## ⭐ 重要不紧急/);
	assert.match(markdown, /- \[ \] 整理方案/);
});

test('task-type Markdown carries a hidden stable identity instead of its mutable label', async () => {
	const { views } = fixtures();
	views[0].title = '客户项目';
	const markdown = generateMarkdown(views[0]);

	assert.match(markdown, /<!-- aulyckanban:view=work -->/);
	assert.doesNotMatch(markdown, /aulyckanban:view=客户项目/);
});
