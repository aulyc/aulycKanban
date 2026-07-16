import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

async function loadRepository() {
	const bundle = await build({
		entryPoints: [new URL('../src/services/repository.ts', import.meta.url).pathname],
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
		console,
	});
	return module.exports.PluginDataRepository;
}

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
	const PluginDataRepository = await loadRepository();
	const repository = new PluginDataRepository(
		async () => ({ settings: rawSettings, board: board() }),
		async () => {},
	);
	return (await repository.load()).settings;
}

test('legacy configured note paths preserve per-task-type synchronization mode', async () => {
	const settings = await loadSettings({
		currentView: 'work',
		activeColumnId: 'base',
		viewSyncTargets: { work: { filePath: '看板/工作任务.md' } },
		archive: { filePath: '看板/归档任务.md' },
	});

	assert.equal(settings.syncMode, 'per-view');
	assert.equal(settings.aggregate.filePath, '');
	assert.equal(settings.viewSyncTargets.work.filePath, '看板/工作任务.md');
});

test('legacy settings without note paths migrate to recommended aggregate mode', async () => {
	const settings = await loadSettings({
		currentView: 'work',
		activeColumnId: 'base',
		viewSyncTargets: { work: { filePath: '' } },
		archive: { filePath: '' },
	});

	assert.equal(settings.syncMode, 'aggregate');
	assert.equal(settings.aggregate.filePath, '');
	assert.equal(settings.schemaVersion, 5);
});

test('explicit aggregate settings preserve their configured note path', async () => {
	const settings = await loadSettings({
		currentView: 'work',
		activeColumnId: 'base',
		syncMode: 'aggregate',
		aggregate: { filePath: '看板/全部任务.md' },
		viewSyncTargets: { work: { filePath: '旧/工作任务.md' } },
		archive: { filePath: '旧/归档.md' },
	});

	assert.equal(settings.syncMode, 'aggregate');
	assert.equal(settings.aggregate.filePath, '看板/全部任务.md');
	assert.equal(settings.viewSyncTargets.work.filePath, '旧/工作任务.md');
});
