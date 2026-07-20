import assert from 'node:assert/strict';
import test from 'node:test';
import {
	isMigratableBoardData,
	migrateBoardData,
	migrateImportedBoardData,
} from '../../src/services/boardMigration.ts';
import {
	buildArchiveNotePath,
	buildManagedNotePath,
	buildUniqueManagedNotePath,
	folderFromFilePath,
	managedNoteTitle,
	normalizeSyncFolder,
} from '../../src/utils/noteSync.ts';

function task(id: string, content: unknown = id): Record<string, unknown> {
	return { id, content, completed: false, createdAt: '2026-01-01T00:00:00.000Z' };
}

function column(tasks: Array<Record<string, unknown>> = []): Record<string, unknown> {
	return { id: 'base', title: '基础', order: 0, tasks };
}

function currentBoard(tasks: Array<Record<string, unknown>> = []): Record<string, unknown> {
	return {
		views: [{ id: 'work', title: '工作', order: 0, columns: [column(tasks)] }],
		archives: { work: { tasks: [] } },
	};
}

test('critical migration paths reject invalid imports and recover persisted legacy data', () => {
	assert.equal(isMigratableBoardData(currentBoard()), true);
	assert.equal(migrateImportedBoardData(currentBoard([{ id: 'missing-content' }])), null);
	assert.equal(migrateImportedBoardData(currentBoard([task('numeric', 123)])), null);
	assert.equal(
		migrateImportedBoardData({
			...currentBoard([task('valid')]),
			archives: { work: { tasks: 'invalid' } },
		}),
		null,
	);

	const imported = migrateImportedBoardData(
		currentBoard([{ id: 'legacy', content: '旧任务' }]),
	);
	assert.notEqual(imported, null);
	assert.equal(imported.views[0]?.columns[0]?.tasks[0]?.completed, false);

	const recovered = migrateBoardData(
		currentBoard([{ id: 'missing' }, task('numeric', 123)]),
	);
	assert.deepEqual(
		recovered.views[0]?.columns[0]?.tasks.map(({ id, content }) => ({ id, content })),
		[{ id: 'numeric', content: '123' }],
	);
	assert.equal(migrateBoardData(null).views.length, 2);
});

test('legacy board formats retain tasks without sharing task arrays', () => {
	const fixed = migrateBoardData({
		work: { columns: [column([task('work')])] },
		personal: { columns: [column([task('personal')])] },
		workArchive: { tasks: [task('work-archive')] },
		personalArchive: { tasks: [] },
	});
	assert.equal(fixed.views[0]?.columns[0]?.tasks[0]?.id, 'work');
	assert.equal(fixed.views[1]?.columns[0]?.tasks[0]?.id, 'personal');

	const oldest = migrateBoardData({ columns: [column([task('old')])] });
	assert.equal(oldest.views[0]?.columns[0]?.tasks[0]?.id, 'old');
	assert.equal(oldest.views[1]?.columns[0]?.tasks.length, 0);
});

test('managed note paths stay inside the Vault and preserve readable names', () => {
	assert.equal(normalizeSyncFolder('../../outside'), 'X-aulyc看板');
	assert.equal(normalizeSyncFolder('./项目//同步/'), '项目/同步');
	assert.equal(normalizeSyncFolder('  '), 'X-aulyc看板');
	assert.equal(managedNoteTitle('💼 客户/项目:一期.md'), '客户／项目：一期');
	assert.equal(buildManagedNotePath('项目', '💼 工作'), '项目/工作.md');
	assert.equal(buildArchiveNotePath('项目'), '项目/归档任务.md');
	assert.equal(buildUniqueManagedNotePath('项目/工作.md', 2), '项目/工作 (2).md');
	assert.equal(buildUniqueManagedNotePath('项目/工作', 3), '项目/工作 (3)');
	assert.equal(folderFromFilePath('项目/工作.md'), '项目');
	assert.equal(folderFromFilePath('工作.md'), '');
});
