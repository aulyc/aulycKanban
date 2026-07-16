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
	assert.equal(settings.schemaVersion, 6);
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
