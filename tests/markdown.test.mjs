import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

async function loadMarkdown() {
	const bundle = await build({
		entryPoints: [new URL('../src/utils/markdown.ts', import.meta.url).pathname],
		bundle: true,
		format: 'cjs',
		platform: 'node',
		write: false,
		logLevel: 'silent',
	});
	const module = { exports: {} };
	vm.runInNewContext(bundle.outputFiles[0].text, {
		module,
		exports: module.exports,
		Date,
	});
	return module.exports;
}

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

test('aggregate Markdown groups active and archived tasks by current labels', async () => {
	const { generateAggregateMarkdown } = await loadMarkdown();
	const { views, archives } = fixtures();
	const markdown = generateAggregateMarkdown(views, archives);

	assert.match(markdown, /## 进行中/);
	assert.match(markdown, /### 💼 工作任务/);
	assert.match(markdown, /#### ⭐ 重要不紧急/);
	assert.match(markdown, /- \[ \] 整理方案/);
	assert.match(markdown, /## 已归档/);
	assert.match(markdown, /- \[x\] 旧任务/);
});

test('aggregate Markdown carries hidden stable identities instead of mutable label identities', async () => {
	const { generateAggregateMarkdown } = await loadMarkdown();
	const { views, archives } = fixtures();
	views[0].title = '客户项目';
	views[0].columns[0].title = '稍后处理';
	const markdown = generateAggregateMarkdown(views, archives);

	assert.match(markdown, /### 客户项目 <!-- aulyckanban:view=work -->/);
	assert.match(markdown, /#### 稍后处理 <!-- aulyckanban:column=important%2Dnot%2Durgent -->/);
	assert.match(markdown, /<!-- aulyckanban:task=task%2Dactive -->/);
	assert.doesNotMatch(markdown, /aulyckanban:view=客户项目/);
});
