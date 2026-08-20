import assert from 'node:assert/strict';
import test from 'node:test';
import taskQueryModule from '../src/utils/taskQuery.ts';

const { getTaskRefKey, queryTaskRefs } = taskQueryModule;

function task(id, content = id, timestamps = {}) {
	return {
		id,
		content,
		completed: false,
		createdAt: '2026-01-01T00:00:00.000Z',
		...timestamps,
	};
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

test('active tasks with equal activity times preserve view and column order', () => {
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

test('active tasks are globally sorted by updated time then created time', () => {
	const activityBoard = {
		views: [
			{
				id: 'work',
				title: '工作任务',
				order: 0,
				columns: [
					{
						id: 'urgent',
						title: '紧急',
						order: 0,
						tasks: [
							task('older-first-quadrant', '较早任务', {
								createdAt: '2026-08-17T19:57:00.000Z',
							}),
						],
					},
					{
						id: 'later',
						title: '稍后',
						order: 1,
						tasks: [
							task('newer-later-quadrant', '刚创建的任务', {
								createdAt: '2026-08-20T16:56:00.000Z',
							}),
						],
					},
				],
			},
			{
				id: 'personal',
				title: '个人任务',
				order: 1,
				columns: [
					{
						id: 'urgent',
						title: '紧急',
						order: 0,
						tasks: [
							task('edited-latest', '刚修改的任务', {
								createdAt: '2026-01-01T00:00:00.000Z',
								updatedAt: '2026-08-20T17:00:00.000Z',
							}),
						],
					},
				],
			},
		],
		archives: { work: { tasks: [] }, personal: { tasks: [] } },
	};

	const refs = queryTaskRefs(activityBoard, {
		taskScope: 'all',
		taskTypeScope: 'all',
		currentViewId: 'work',
		columnScope: 'all',
		activeColumnId: 'urgent',
		keyword: '',
	});

	assert.deepEqual(
		refs.map((ref) => ref.task.id),
		['edited-latest', 'newer-later-quadrant', 'older-first-quadrant'],
	);
});

test('active task sorting falls back to created time and remains stable for ties', () => {
	const fallbackBoard = {
		views: [
			{
				id: 'work',
				title: '工作任务',
				order: 0,
				columns: [
					{
						id: 'urgent',
						title: '紧急',
						order: 0,
						tasks: [
							task('same-time-first', '同时间一', {
								createdAt: '2026-08-20T16:00:00.000Z',
							}),
						],
					},
					{
						id: 'later',
						title: '稍后',
						order: 1,
						tasks: [
							task('invalid-update-fallback', '无效修改时间', {
								createdAt: '2026-08-20T17:00:00.000Z',
								updatedAt: 'invalid',
							}),
							task('same-time-second', '同时间二', {
								createdAt: '2026-08-20T16:00:00.000Z',
							}),
						],
					},
				],
			},
		],
		archives: { work: { tasks: [] } },
	};

	const refs = queryTaskRefs(fallbackBoard, {
		taskScope: 'current',
		taskTypeScope: 'current',
		currentViewId: 'work',
		columnScope: 'all',
		activeColumnId: 'urgent',
		keyword: '',
	});

	assert.deepEqual(
		refs.map((ref) => ref.task.id),
		['invalid-update-fallback', 'same-time-first', 'same-time-second'],
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
