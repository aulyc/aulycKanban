import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

class MockTFile {
	constructor(path) {
		this.path = path;
	}
}

async function loadSyncService(notices) {
	const bundle = await build({
		entryPoints: [new URL('../src/services/syncService.ts', import.meta.url).pathname],
		bundle: true,
		format: 'cjs',
		platform: 'node',
		external: ['obsidian'],
		write: false,
		logLevel: 'silent',
	});
	const module = { exports: {} };
	vm.runInNewContext(bundle.outputFiles[0].text, {
		module,
		exports: module.exports,
		console,
		Date,
		setTimeout,
		clearTimeout,
		require: (id) => {
			if (id !== 'obsidian') throw new Error(`Unexpected import: ${id}`);
			return {
				Notice: class {
					constructor(message) {
						notices.push(message);
					}
				},
				normalizePath: (value) => value,
				TFile: MockTFile,
			};
		},
	});
	return module.exports.VaultSyncService;
}

function createVault() {
	const files = new Map();
	const folders = [];
	return {
		files,
		folders,
		getAbstractFileByPath(path) {
			return files.get(path) ?? (folders.includes(path) ? { path } : null);
		},
		async createFolder(path) {
			folders.push(path);
		},
		async create(path, content) {
			const file = new MockTFile(path);
			file.content = content;
			files.set(path, file);
			return file;
		},
		async process(file, transform) {
			file.content = transform(file.content);
		},
	};
}

function createStore(settings = {}) {
	const view = {
		id: 'work',
		title: '工作任务',
		order: 0,
		columns: [
			{
				id: 'base',
				title: '基础',
				order: 0,
				tasks: [
					{
						id: 'task-1',
						content: '测试任务',
						completed: false,
						createdAt: '2026-01-01T00:00:00.000Z',
					},
				],
			},
		],
	};
	const resolvedSettings = {
		syncMode: 'aggregate',
		aggregate: { filePath: '看板/全部任务.md' },
		viewSyncTargets: { work: { filePath: '看板/工作任务.md' } },
		archive: { filePath: '看板/归档任务.md' },
		syncDebounce: 0,
		...settings,
	};
	return {
		getSettings: () => resolvedSettings,
		getCurrentView: () => 'work',
		getTaskViews: () => [view],
		getView: (id) => (id === 'work' ? view : undefined),
		getArchive: () => [],
	};
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

test('aggregate scheduling creates one configured note and its missing folder', async () => {
	const notices = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault();
	const service = new VaultSyncService(vault, createStore());

	service.scheduleSyncAllViews();
	await delay(10);

	assert.deepEqual(vault.folders, ['看板']);
	assert.equal(vault.files.has('看板/全部任务.md'), true);
	assert.equal(vault.files.has('看板/工作任务.md'), false);
	assert.match(vault.files.get('看板/全部任务.md').content, /测试任务/);
	assert.equal(notices.length, 0);
});

test('aggregate scheduling with an empty path does not create files', async () => {
	const notices = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault();
	const service = new VaultSyncService(vault, createStore({ aggregate: { filePath: '' } }));

	service.scheduleSyncAllViews();
	await delay(10);

	assert.equal(vault.files.size, 0);
	assert.equal(vault.folders.length, 0);
});

test('legacy per-task-type mode continues writing its configured notes', async () => {
	const notices = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault();
	const service = new VaultSyncService(vault, createStore({ syncMode: 'per-view' }));

	service.scheduleSyncAllViews();
	await delay(10);

	assert.equal(vault.files.has('看板/全部任务.md'), false);
	assert.equal(vault.files.has('看板/工作任务.md'), true);
	assert.equal(vault.files.has('看板/归档任务.md'), true);
});
