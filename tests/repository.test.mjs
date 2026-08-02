import assert from 'node:assert/strict';
import test from 'node:test';
import repositoryModule from '../src/services/repository.ts';

const { PluginDataRepository } = repositoryModule;

function board() {
	return {
		views: [
			{
				id: 'work',
				title: '工作任务',
				order: 0,
				columns: [{ id: 'base', title: '基础', order: 0, tasks: [] }],
			},
		],
		archives: { work: { tasks: [] } },
	};
}

async function loadSettings(rawSettings) {
	const repository = new PluginDataRepository(
		async () => ({ settings: rawSettings, board: board() }),
		async () => {},
	);
	return (await repository.load()).settings;
}

test('legacy per-task-type paths migrate into the single managed folder model', async () => {
	const settings = await loadSettings({
		currentView: 'work',
		activeColumnId: 'base',
		viewSyncTargets: { work: { filePath: '看板/工作任务.md' } },
		archive: { filePath: '看板/归档任务.md' },
	});

	assert.equal(settings.syncFolder, '看板');
	assert.equal(settings.viewSyncTargets.work.filePath, '看板/工作任务.md');
	assert.equal('syncMode' in settings, false);
	assert.equal('aggregate' in settings, false);
});

test('settings without note paths use the default automatic sync folder', async () => {
	const settings = await loadSettings({
		currentView: 'work',
		activeColumnId: 'base',
		viewSyncTargets: { work: { filePath: '' } },
		archive: { filePath: '' },
	});

	assert.equal(settings.syncFolder, 'X-aulyc看板');
	assert.equal(settings.viewSyncTargets.work.filePath, '');
	assert.equal(settings.schemaVersion, 8);
	assert.equal('autoCheckUpdates' in settings, false);
});

test('legacy project update preferences are retired during settings migration', async () => {
	assert.equal('autoCheckUpdates' in (await loadSettings({ autoCheckUpdates: true })), false);
});

test('legacy aggregate settings contribute only their folder and leave the old note untouched', async () => {
	const settings = await loadSettings({
		currentView: 'work',
		activeColumnId: 'base',
		syncMode: 'aggregate',
		aggregate: { filePath: '历史同步/全部任务.md' },
		viewSyncTargets: { work: { filePath: '旧分文件/工作任务.md' } },
		archive: { filePath: '旧分文件/归档任务.md' },
	});

	assert.equal(settings.syncFolder, '历史同步');
	assert.equal(settings.viewSyncTargets.work.filePath, '旧分文件/工作任务.md');
	assert.equal('aggregate' in settings, false);
});
