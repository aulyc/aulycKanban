import assert from 'node:assert/strict';
import test from 'node:test';
import backupFormatModule from '../src/services/backupFormat.ts';

const { parseBackupData } = backupFormatModule;

function task(id) {
	return { id, content: id, completed: false, createdAt: '2026-01-01T00:00:00.000Z' };
}

function column(id = 'base', tasks = []) {
	return { id, title: '基础', order: 0, tasks };
}

function currentBoard() {
	return {
		views: [{ id: 'work', title: '工作', order: 0, columns: [column('base', [task('current')])] }],
		archives: { work: { tasks: [] } },
	};
}

test('backup parser accepts current, historical, and unversioned board formats', () => {
	const current = parseBackupData({ ...currentBoard(), version: '4.0' });
	assert.equal(current.ok, true);
	assert.equal(current.sourceVersion, '4.0');

	const fixedViews = parseBackupData({
		version: '2.0',
		work: { columns: [column('base', [task('work')])] },
		personal: { columns: [column('base', [task('personal')])] },
		workArchive: { tasks: [] },
		personalArchive: { tasks: [] },
	});
	assert.equal(fixedViews.ok, true);
	assert.equal(fixedViews.sourceVersion, '2.0');
	assert.deepEqual(
		fixedViews.board.views.map((view) => view.id),
		['work', 'personal'],
	);

	const unversioned = parseBackupData({ columns: [column('base', [task('legacy')])] });
	assert.equal(unversioned.ok, true);
	assert.equal(unversioned.sourceVersion, 'legacy');
});

test('backup parser rejects newer, unknown, malformed, and shape-mismatched versions', () => {
	assert.deepEqual(parseBackupData({ ...currentBoard(), version: '5.0' }), {
		ok: false,
		reason: 'newer-version',
		declaredVersion: '5.0',
	});
	assert.deepEqual(parseBackupData({ ...currentBoard(), version: '3.0' }), {
		ok: false,
		reason: 'unsupported-version',
		declaredVersion: '3.0',
	});
	assert.deepEqual(parseBackupData({ ...currentBoard(), version: 4 }), {
		ok: false,
		reason: 'invalid-version',
		declaredVersion: 4,
	});
	assert.deepEqual(parseBackupData({ ...currentBoard(), version: '2.0' }), {
		ok: false,
		reason: 'version-mismatch',
		declaredVersion: '2.0',
	});
	assert.deepEqual(parseBackupData({ views: currentBoard().views, version: '4.0' }), {
		ok: false,
		reason: 'version-mismatch',
		declaredVersion: '4.0',
	});
});

test('backup parser reports duplicate identities without returning partial data', () => {
	const board = currentBoard();
	board.views.push({ ...structuredClone(board.views[0]), title: '重复', order: 1 });
	assert.deepEqual(parseBackupData({ ...board, version: '4.0' }), {
		ok: false,
		reason: 'duplicate-id',
		duplicate: { field: 'viewId', id: 'work' },
	});
});
