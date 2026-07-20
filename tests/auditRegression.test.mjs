import assert from 'node:assert/strict';
import test from 'node:test';
import boardMigrationModule from '../src/services/boardMigration.ts';
import noteSyncModule from '../src/utils/noteSync.ts';

const { migrateBoardData, migrateImportedBoardData } = boardMigrationModule;
const { normalizeSyncFolder } = noteSyncModule;

function task(id, content = id) {
	return { id, content, completed: false, createdAt: '2026-01-01T00:00:00.000Z' };
}

function column(id, title, tasks = [], order = 0) {
	return { id, title, tasks, order };
}

function view(id, title, columns, order = 0) {
	return { id, title, columns, order };
}

test('backup import rejects malformed task elements instead of persisting them', async () => {
	const createImport = (tasks) => ({
		views: [view('work', '工作', [column('base', '基础', tasks)])],
		archives: { work: { tasks: [] } },
	});

	assert.equal(migrateImportedBoardData(createImport([{ id: 'missing-content' }])), null);
	assert.equal(
		migrateImportedBoardData(createImport([{ ...task('wrong-content'), content: 123 }])),
		null,
	);
	assert.equal(
		migrateImportedBoardData({
			...createImport([task('valid')]),
			archives: { work: { tasks: 'not-an-array' } },
		}),
		null,
	);
});

test('backup import accepts legacy tasks with omitted derived fields and normalizes them', async () => {
	const board = migrateImportedBoardData({
		views: [view('work', '工作', [column('base', '基础', [{ id: 'legacy', content: '旧任务' }])])],
		archives: { work: { tasks: [] } },
	});

	assert.notEqual(board, null);
	assert.equal(board.views[0].columns[0].tasks[0].content, '旧任务');
	assert.equal(board.views[0].columns[0].tasks[0].completed, false);
	assert.equal(typeof board.views[0].columns[0].tasks[0].createdAt, 'string');
});

test('persisted malformed tasks are sanitized so legacy data cannot crash rendering', async () => {
	const board = migrateBoardData({
		views: [
			view('work', '工作', [
				column('base', '基础', [
					{ id: 'missing-content' },
					{ id: 'numeric-content', content: 123 },
				]),
			]),
		],
		archives: { work: { tasks: [{ content: 'missing-id' }] } },
	});

	assert.equal(board.views[0].columns[0].tasks.length, 1);
	assert.equal(board.views[0].columns[0].tasks[0].id, 'numeric-content');
	assert.equal(board.views[0].columns[0].tasks[0].content, '123');
	assert.equal(board.views[0].columns[0].tasks[0].completed, false);
	assert.equal(typeof board.views[0].columns[0].tasks[0].createdAt, 'string');
	assert.equal(board.archives.work.tasks.length, 0);
});

test('managed folder normalization cannot escape the Vault with parent segments', async () => {
	assert.equal(normalizeSyncFolder('../../outside'), 'X-aulyc看板');
	assert.equal(normalizeSyncFolder('项目/../同步'), 'X-aulyc看板');
	assert.equal(normalizeSyncFolder('./项目/同步'), '项目/同步');
});
