import assert from 'node:assert/strict';
import test from 'node:test';
import taskQueryModule from '../src/utils/taskQuery.ts';

const { getTaskRefKey, queryTaskRefs } = taskQueryModule;

function task(id, content = id) {
	return { id, content, completed: false, createdAt: '2026-01-01T00:00:00.000Z' };
}

const board = {
	views: [
		{
			id: 'work',
			title: '工作任务',
			order: 0,
			columns: [
				{ id: 'urgent', title: '紧急', order: 0, tasks: [task('work-urgent', '处理邮箱')] },
				{ id: 'later', title: '稍后', order: 1, tasks: [task('work-later', '整理文档')] },
			],
		},
		{
			id: 'personal',
			title: '个人任务',
			order: 1,
			columns: [
				{ id: 'urgent', title: '紧急', order: 0, tasks: [task('personal-urgent', '购买药品')] },
				{ id: 'later', title: '稍后', order: 1, tasks: [task('personal-later', '整理\n照片')] },
			],
		},
	],
	archives: {
		work: { tasks: [{ ...task('work-archive', '处理旧邮箱'), sourceColumnId: 'urgent' }] },
		personal: {
			tasks: [
				{ ...task('personal-urgent-archive', '购买旧药品'), sourceColumnId: 'urgent' },
				{ ...task('personal-archive', '整理旧照片'), sourceColumnId: 'later' },
			],
		},
	},
};

test('specific task type and quadrant return only their intersecting active tasks', () => {
	const refs = queryTaskRefs(board, {
		taskScope: 'current',
		taskTypeScope: 'current',
		currentViewId: 'personal',
		columnScope: 'current',
		activeColumnId: 'urgent',
		keyword: '',
	});

	assert.equal(JSON.stringify(refs.map((ref) => ref.task.id)), '["personal-urgent"]');
	assert.equal(refs[0].viewId, 'personal');
	assert.equal(refs[0].columnId, 'urgent');
});

test('all task and quadrant scopes preserve view and column order', () => {
	const refs = queryTaskRefs(board, {
		taskScope: 'all',
		taskTypeScope: 'all',
		currentViewId: 'personal',
		columnScope: 'all',
		activeColumnId: 'urgent',
		keyword: '',
	});

	assert.equal(
		JSON.stringify(refs.map((ref) => ref.task.id)),
		'["work-urgent","work-later","personal-urgent","personal-later"]',
	);
});

test('search normalizes whitespace and filters only task content inside the selected scopes', () => {
	const refs = queryTaskRefs(board, {
		taskScope: 'all',
		taskTypeScope: 'all',
		currentViewId: 'work',
		columnScope: 'all',
		activeColumnId: 'urgent',
		keyword: '  整理   照片  ',
	});

	assert.equal(JSON.stringify(refs.map((ref) => ref.task.id)), '["personal-later"]');
});

test('archive scope intersects the selected task type and quadrant', () => {
	const refs = queryTaskRefs(board, {
		taskScope: 'archive',
		taskTypeScope: 'current',
		currentViewId: 'personal',
		columnScope: 'current',
		activeColumnId: 'urgent',
		keyword: '旧',
	});

	assert.equal(JSON.stringify(refs.map((ref) => ref.task.id)), '["personal-urgent-archive"]');
	assert.equal(refs[0].viewTitle, '个人任务');
	assert.equal(refs[0].columnTitle, '紧急');
});

test('archive scope preserves the all-task-types selection when requested', () => {
	const refs = queryTaskRefs(board, {
		taskScope: 'archive',
		taskTypeScope: 'all',
		currentViewId: 'personal',
		columnScope: 'current',
		activeColumnId: 'urgent',
		keyword: '旧',
	});

	assert.equal(
		JSON.stringify(refs.map((ref) => ref.task.id)),
		'["work-archive","personal-urgent-archive"]',
	);
});

test('task reference keys include every source coordinate', () => {
	assert.equal(
		getTaskRefKey({ viewId: 'work', columnId: 'urgent', task: task('same') }),
		'work:urgent:same',
	);
});
