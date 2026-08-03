import assert from 'node:assert/strict';
import test from 'node:test';
import boardMigrationModule from '../src/services/boardMigration.ts';
import storeModule from '../src/store.ts';

const { migrateBoardData } = boardMigrationModule;
const { KanbanStore } = storeModule;

globalThis.window = globalThis;

function task(id, content = id) {
	return { id, content, completed: false, createdAt: '2026-01-01T00:00:00.000Z' };
}

function column(id, title, tasks = [], order = 0) {
	return { id, title, tasks, order };
}

function view(id, title, columns, order) {
	return { id, title, columns, order };
}

function settings(currentView = 'personal', activeColumnId = 'base') {
	return {
		currentView,
		activeColumnId,
		showArchive: false,
		viewSyncTargets: {
			work: { filePath: '' },
			personal: { filePath: '' },
		},
		archive: { filePath: '' },
		syncFolder: 'X-aulyc看板',
		schemaVersion: 6,
		saveDebounce: 500,
		syncDebounce: 2000,
	};
}

function createStore(board, currentView = 'personal', activeColumnId = 'base') {
	return new KanbanStore(settings(currentView, activeColumnId), board, {
		persistData: async () => {},
	});
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 200) {
	const startedAt = Date.now();
	while (!predicate()) {
		if (Date.now() - startedAt >= timeoutMs) throw new Error('Timed out waiting for condition');
		await delay(5);
	}
}

function definitions(columns) {
	return columns.map(({ id, title, order }) => ({ id, title, order }));
}

test('fixed work/personal data migrates without mixing tasks', () => {
	const board = migrateBoardData({
		work: { columns: [column('base', '基础', [task('work-base')])] },
		personal: {
			columns: [
				column('base', '基础', [task('personal-base')]),
				column('custom', '测试', [task('personal-custom')], 1),
			],
		},
		workArchive: { tasks: [task('work-archive')] },
		personalArchive: { tasks: [task('personal-archive')] },
	});

	assert.equal(board.views.length, 2);
	assert.equal(
		JSON.stringify(definitions(board.views[0].columns)),
		JSON.stringify(definitions(board.views[1].columns)),
	);
	assert.equal(board.views[0].columns.find((item) => item.id === 'custom').tasks.length, 0);
	assert.equal(
		board.views[1].columns.find((item) => item.id === 'custom').tasks[0].id,
		'personal-custom',
	);
	assert.equal(board.archives.work.tasks[0].id, 'work-archive');
});

test('adding a third task type copies every quadrant with independent task arrays', () => {
	const store = createStore({
		views: [
			view('work', '工作', [column('base', '基础', [task('work-task')])], 0),
			view('personal', '个人', [column('base', '基础', [task('personal-task')])], 1),
		],
		archives: { work: { tasks: [] }, personal: { tasks: [] } },
	});

	store.dispatch({ type: 'ADD_COLUMN', payload: { title: '测试象限' } });
	store.dispatch({ type: 'ADD_VIEW', payload: { title: '项目任务' } });
	const views = store.getTaskViews();
	const project = views[2];

	assert.equal(views.length, 3);
	assert.equal(project.title, '项目任务');
	assert.equal(project.columns.length, 2);
	assert.equal(
		project.columns.every((item) => item.tasks.length === 0),
		true,
	);
	assert.equal(
		JSON.stringify(definitions(views[0].columns)),
		JSON.stringify(definitions(project.columns)),
	);
	assert.notEqual(views[0].columns[0].tasks, project.columns[0].tasks);
	assert.equal(store.getCurrentView(), project.id);
	assert.equal(store.getBoardData().archives[project.id].tasks.length, 0);
	assert.equal(store.getSettings().viewSyncTargets[project.id].filePath, '');
	store.destroy();
});

test('task types can be renamed and deleted without leaving archive or sync settings behind', () => {
	const customSettings = settings('project', 'base');
	customSettings.viewSyncTargets.project = { filePath: '看板/项目.md' };
	const store = new KanbanStore(
		customSettings,
		{
			views: [
				view('work', '工作', [column('base', '基础')], 0),
				view('personal', '个人', [column('base', '基础')], 1),
				view('project', '项目', [column('base', '基础', [task('project-task')])], 2),
			],
			archives: {
				work: { tasks: [] },
				personal: { tasks: [] },
				project: { tasks: [task('project-archive')] },
			},
		},
		{ persistData: async () => {} },
	);

	store.dispatch({ type: 'RENAME_VIEW', payload: { viewId: 'project', title: '  客户项目  ' } });
	assert.equal(store.getView('project').title, '客户项目');
	assert.equal(store.getView('project').columns[0].tasks[0].id, 'project-task');
	assert.equal(store.getSettings().viewSyncTargets.project.filePath, '看板/项目.md');

	store.dispatch({ type: 'DELETE_VIEW', payload: { viewId: 'project' } });
	assert.equal(store.getView('project'), undefined);
	assert.equal(store.getBoardData().archives.project, undefined);
	assert.equal(store.getSettings().viewSyncTargets.project, undefined);
	assert.equal(store.getCurrentView(), 'work');
	assert.equal(JSON.stringify(store.getTaskViews().map((item) => item.order)), '[0,1]');

	store.dispatch({ type: 'DELETE_VIEW', payload: { viewId: 'personal' } });
	store.dispatch({ type: 'DELETE_VIEW', payload: { viewId: 'work' } });
	assert.equal(store.getTaskViews().length, 1);
	assert.equal(store.getView('work')?.title, '工作');
	store.destroy();
});

test('a new quadrant appears in every existing task type while task contents stay independent', () => {
	const store = createStore({
		views: [
			view('work', '工作', [column('base', '基础')], 0),
			view('personal', '个人', [column('base', '基础')], 1),
			view('project', '项目', [column('base', '基础')], 2),
		],
		archives: { work: { tasks: [] }, personal: { tasks: [] }, project: { tasks: [] } },
	});

	store.dispatch({ type: 'ADD_COLUMN', payload: { title: '共同象限' } });
	const addedId = store.getActiveColumnId();
	for (const item of store.getTaskViews()) {
		assert.equal(item.columns.find((candidate) => candidate.id === addedId).title, '共同象限');
	}

	store.dispatch({ type: 'ADD_TASK', payload: { columnId: addedId, content: '只属于个人' } });
	assert.equal(
		store.getView('personal').columns.find((item) => item.id === addedId).tasks.length,
		1,
	);
	assert.equal(store.getView('work').columns.find((item) => item.id === addedId).tasks.length, 0);
	assert.equal(
		store.getView('project').columns.find((item) => item.id === addedId).tasks.length,
		0,
	);
	store.destroy();
});

test('archive quadrant counts follow the selected task type scope and legacy fallback', () => {
	const views = ['work', 'personal', 'project'].map((id, order) =>
		view(id, id, [column('base', '基础'), column('second', '第二', [], 1)], order),
	);
	const board = {
		views,
		archives: {
			work: { tasks: [{ ...task('work-second'), sourceColumnId: 'second' }] },
			personal: { tasks: [task('personal-legacy')] },
			project: { tasks: [{ ...task('project-removed'), sourceColumnId: 'removed' }] },
		},
	};
	const store = createStore(board, 'project', 'second');

	assert.equal(store.getArchiveTaskCount('second'), 0);
	assert.equal(store.getArchiveTaskCount('base'), 1);
	store.dispatch({ type: 'SHOW_ALL_TASKS' });
	assert.equal(store.getArchiveTaskCount('second'), 1);
	assert.equal(store.getArchiveTaskCount('base'), 2);
	assert.equal(store.getArchiveColumnId(board.archives.personal.tasks[0]), 'base');
	assert.equal(store.getArchiveColumnId(board.archives.project.tasks[0]), 'base');
	store.destroy();
});

test('archive activation preserves current or all task types while intersecting the quadrant', () => {
	const store = createStore(
		{
			views: [
				view('work', '工作', [column('base', '基础')], 0),
				view('personal', '个人', [column('base', '基础')], 1),
			],
			archives: {
				work: { tasks: [{ ...task('work-archive'), sourceColumnId: 'base' }] },
				personal: { tasks: [{ ...task('personal-archive'), sourceColumnId: 'base' }] },
			},
		},
		'personal',
		'base',
	);

	store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
	assert.equal(store.getTaskScope(), 'archive');
	assert.equal(store.isShowingAllTasks(), false);
	assert.equal(
		JSON.stringify(store.getVisibleTaskRefs().map((ref) => ref.task.id)),
		'["personal-archive"]',
	);

	store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
	assert.equal(store.getTaskScope(), 'current');
	store.dispatch({ type: 'SHOW_ALL_TASKS' });
	store.dispatch({ type: 'TOGGLE_ARCHIVE_VIEW' });
	assert.equal(store.getTaskScope(), 'archive');
	assert.equal(store.isShowingAllTasks(), true);
	assert.equal(
		JSON.stringify(store.getVisibleTaskRefs().map((ref) => ref.task.id)),
		'["work-archive","personal-archive"]',
	);
	store.destroy();
});

test('aggregate scopes and search filter visible tasks without replacing concrete selections', () => {
	const store = createStore(
		{
			views: [
				view(
					'work',
					'工作',
					[
						column('base', '基础', [task('work-base', '共同关键词')]),
						column('second', '第二', [task('work-second', '其他内容')], 1),
					],
					0,
				),
				view(
					'personal',
					'个人',
					[
						column('base', '基础', [task('personal-base', '共同关键词')]),
						column('second', '第二', [task('personal-second', '共同关键词')], 1),
					],
					1,
				),
			],
			archives: { work: { tasks: [] }, personal: { tasks: [] } },
		},
		'personal',
		'base',
	);

	store.dispatch({ type: 'SHOW_ALL_TASKS' });
	store.dispatch({ type: 'SHOW_ALL_COLUMNS' });
	store.dispatch({ type: 'SET_SEARCH_QUERY', payload: { keyword: '关键词' } });

	assert.equal(store.getCurrentView(), 'personal');
	assert.equal(store.getActiveColumnId(), 'base');
	assert.equal(store.isShowingAllTasks(), true);
	assert.equal(store.isShowingAllColumns(), true);
	assert.equal(store.getSearchKeyword(), '关键词');
	assert.equal(
		JSON.stringify(store.getVisibleTaskRefs().map((ref) => ref.task.id)),
		'["work-base","personal-base","personal-second"]',
	);
	assert.equal(store.getTaskCountForColumn('base'), 2);
	assert.equal(store.getVisibleTaskCount(), 3);
	assert.equal(store.lastActionMutatedData, false);
	store.destroy();
});

test('creating a task type or quadrant leaves aggregate scope on the new concrete destination', () => {
	const store = createStore({
		views: [
			view('work', '工作', [column('base', '基础')], 0),
			view('personal', '个人', [column('base', '基础')], 1),
		],
		archives: { work: { tasks: [] }, personal: { tasks: [] } },
	});

	store.dispatch({ type: 'SHOW_ALL_TASKS' });
	store.dispatch({ type: 'SHOW_ALL_COLUMNS' });
	store.dispatch({ type: 'ADD_VIEW', payload: { title: '项目' } });
	assert.equal(store.getTaskScope(), 'current');
	assert.equal(store.getColumnScope(), 'current');
	assert.equal(store.getCurrentTaskView().title, '项目');

	store.dispatch({ type: 'SHOW_ALL_COLUMNS' });
	store.dispatch({ type: 'ADD_COLUMN', payload: { title: '新象限' } });
	assert.equal(store.getColumnScope(), 'current');
	assert.equal(store.getActiveColumn().title, '新象限');
	store.destroy();
});

test('replacing or clearing board data resets transient aggregate and search scopes', () => {
	const original = {
		views: [view('personal', '个人', [column('base', '基础')], 0)],
		archives: { personal: { tasks: [] } },
	};
	const store = createStore(original);
	store.dispatch({ type: 'SHOW_ALL_TASKS' });
	store.dispatch({ type: 'SHOW_ALL_COLUMNS' });
	store.dispatch({ type: 'SET_SEARCH_QUERY', payload: { keyword: '关键词' } });

	store.dispatch({ type: 'SET_BOARD_DATA', payload: { board: structuredClone(original) } });
	assert.equal(store.getTaskScope(), 'current');
	assert.equal(store.getColumnScope(), 'current');
	assert.equal(store.getSearchKeyword(), '');

	store.dispatch({ type: 'SHOW_ALL_TASKS' });
	store.dispatch({ type: 'SHOW_ALL_COLUMNS' });
	store.dispatch({ type: 'SET_SEARCH_QUERY', payload: { keyword: '关键词' } });
	store.dispatch({ type: 'CLEAR_ALL_DATA' });
	assert.equal(store.getTaskScope(), 'current');
	assert.equal(store.getColumnScope(), 'current');
	assert.equal(store.getSearchKeyword(), '');
	store.destroy();
});

test('task mutations use an explicit source view without switching the selected task type', () => {
	const store = createStore(
		{
			views: [
				view('work', '工作', [column('base', '基础', [task('shared', '工作内容')])], 0),
				view('personal', '个人', [column('base', '基础', [task('shared', '个人内容')])], 1),
			],
			archives: { work: { tasks: [] }, personal: { tasks: [] } },
		},
		'personal',
		'base',
	);

	store.dispatch({
		type: 'EDIT_TASK',
		payload: { viewId: 'work', columnId: 'base', taskId: 'shared', content: '工作已修改' },
	});
	assert.equal(store.getView('work').columns[0].tasks[0].content, '工作已修改');
	assert.equal(store.getView('personal').columns[0].tasks[0].content, '个人内容');
	assert.equal(store.getCurrentView(), 'personal');
	assert.equal(store.lastMutatedViewId, 'work');

	store.dispatch({
		type: 'TOGGLE_TASK',
		payload: { viewId: 'work', columnId: 'base', taskId: 'shared' },
	});
	assert.equal(store.getView('work').columns[0].tasks.length, 0);
	assert.equal(store.getArchive('work')[0].content, '工作已修改');
	assert.equal(store.getArchive('personal').length, 0);
	assert.equal(store.lastMutatedViewId, 'work');
	store.destroy();
});

test('archive restore and deletion use explicit task type references when ids collide', () => {
	const archived = (content) => ({
		...task('same', content),
		completed: true,
		sourceColumnId: 'base',
		archivedAt: '2026-01-02T00:00:00.000Z',
	});
	const store = createStore(
		{
			views: [
				view('work', '工作', [column('base', '基础')], 0),
				view('personal', '个人', [column('base', '基础')], 1),
			],
			archives: {
				work: { tasks: [archived('工作归档')] },
				personal: { tasks: [archived('个人归档')] },
			},
		},
		'personal',
		'base',
	);

	store.dispatch({ type: 'RESTORE_TASK', payload: { viewId: 'work', taskId: 'same' } });
	assert.equal(store.getView('work').columns[0].tasks[0].content, '工作归档');
	assert.equal(store.getArchive('personal')[0].content, '个人归档');
	assert.equal(store.lastMutatedViewId, 'work');

	store.dispatch({
		type: 'DELETE_ARCHIVE_TASKS',
		payload: { tasks: [{ viewId: 'personal', taskId: 'same' }] },
	});
	assert.equal(store.getArchive('personal').length, 0);
	store.destroy();
});

test('editing a task with unchanged content does not bump updatedAt, mark data mutated, or persist', async () => {
	let saveAttempts = 0;
	const store = new KanbanStore(
		{ ...settings(), saveDebounce: 1 },
		{
			views: [view('personal', '个人', [column('base', '基础', [task('t1', '内容')])], 0)],
			archives: { personal: { tasks: [] } },
		},
		{
			persistData: async () => {
				saveAttempts += 1;
			},
		},
	);

	store.dispatch({
		type: 'EDIT_TASK',
		payload: { columnId: 'base', taskId: 't1', content: '内容' },
	});
	assert.equal(store.getView('personal').columns[0].tasks[0].updatedAt, undefined);
	assert.equal(store.lastActionMutatedData, false);
	await delay(20);
	assert.equal(saveAttempts, 0);

	store.dispatch({
		type: 'EDIT_TASK',
		payload: { columnId: 'base', taskId: 't1', content: '新内容' },
	});
	const changed = store.getView('personal').columns[0].tasks[0];
	assert.equal(changed.content, '新内容');
	assert.notEqual(changed.updatedAt, undefined);
	assert.equal(store.lastActionMutatedData, true);
	store.destroy();
});

test('saveNow performs at most two automatic retries after a failure', async () => {
	let saveAttempts = 0;
	const store = new KanbanStore(
		{ ...settings(), saveDebounce: 1 },
		{
			views: [view('personal', '个人', [column('base', '基础')], 0)],
			archives: { personal: { tasks: [] } },
		},
		{
			persistData: async () => {
				saveAttempts += 1;
				throw new Error('save failed');
			},
		},
	);

	await assert.rejects(store.saveNow(), /save failed/);
	await waitFor(() => saveAttempts === 3);
	await delay(20);
	assert.equal(saveAttempts, 3);
	store.destroy();
});

test('destroy flushes a pending debounced save exactly once', async () => {
	let saveAttempts = 0;
	const store = new KanbanStore(
		{ ...settings(), saveDebounce: 100 },
		{
			views: [view('personal', '个人', [column('base', '基础')], 0)],
			archives: { personal: { tasks: [] } },
		},
		{
			persistData: async () => {
				saveAttempts += 1;
			},
		},
	);

	store.dispatch({ type: 'ADD_TASK', payload: { columnId: 'base', content: '待保存' } });
	assert.equal(saveAttempts, 0);
	store.destroy();
	assert.equal(saveAttempts, 1);
	await delay(120);
	assert.equal(saveAttempts, 1);
});

test('rename, reorder, and delete quadrants apply to all task types and archives', () => {
	const views = ['work', 'personal', 'project'].map((id, order) =>
		view(
			id,
			id,
			[column('base', '基础'), column('second', '第二', [task(`${id}-second`)], 1)],
			order,
		),
	);
	const archives = Object.fromEntries(
		views.map((item) => [
			item.id,
			{
				tasks: [{ ...task(`${item.id}-archive`), sourceColumnId: 'second' }],
			},
		]),
	);
	const store = createStore({ views, archives }, 'project', 'second');

	store.dispatch({ type: 'RENAME_COLUMN', payload: { columnId: 'second', title: '统一名称' } });
	store.dispatch({ type: 'REORDER_COLUMNS', payload: { columnIds: ['second', 'base'] } });
	for (const item of store.getTaskViews())
		assert.equal(item.columns.find((candidate) => candidate.id === 'second').title, '统一名称');

	store.dispatch({ type: 'DELETE_COLUMN', payload: { columnId: 'second', moveTasks: true } });
	for (const item of store.getTaskViews()) {
		assert.equal(item.columns.length, 1);
		assert.equal(item.columns[0].tasks[0].id, `${item.id}-second`);
		assert.equal(store.getBoardData().archives[item.id].tasks[0].sourceColumnId, 'base');
	}
	assert.equal(store.getActiveColumnId(), 'base');
	store.destroy();
});
