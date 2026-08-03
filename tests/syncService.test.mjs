import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

globalThis.window = globalThis;

class MockTFile {
	constructor(path, content = '') {
		this.path = path;
		this.content = content;
	}
}

async function loadSyncService(notices) {
	const module = await loadSourceModule(
		new URL('../src/services/syncService.ts', import.meta.url),
		{
			label: 'sync-service',
			mocks: {
				obsidian: {
					Notice: class {
						constructor(message) {
							notices.push(message);
						}
					},
					normalizePath: (value) => value.replaceAll('//', '/'),
					TFile: MockTFile,
				},
			},
		},
	);
	return module.VaultSyncService;
}

function createVault(initialFiles = {}) {
	const files = new Map(
		Object.entries(initialFiles).map(([path, content]) => [path, new MockTFile(path, content)]),
	);
	const folders = new Set();
	return {
		files,
		folders,
		getAbstractFileByPath(path) {
			return files.get(path) ?? (folders.has(path) ? { path } : null);
		},
		async createFolder(path) {
			folders.add(path);
		},
		async create(path, content) {
			const file = new MockTFile(path, content);
			files.set(path, file);
			return file;
		},
		async process(file, transform) {
			file.content = transform(file.content);
		},
		async cachedRead(file) {
			return file.content;
		},
		async rename(file, nextPath) {
			files.delete(file.path);
			file.path = nextPath;
			files.set(nextPath, file);
		},
	};
}

function createView(id, title, content) {
	return {
		id,
		title,
		order: id === 'work' ? 0 : 1,
		columns: [
			{
				id: 'base',
				title: '基础',
				order: 0,
				tasks: [
					{
						id: `${id}-task`,
						content,
						completed: false,
						createdAt: '2026-01-01T00:00:00.000Z',
					},
				],
			},
		],
	};
}

function createStore(overrides = {}) {
	const settings = {
		syncFolder: 'X-aulyc看板',
		viewSyncTargets: { work: { filePath: '' }, personal: { filePath: '' } },
		archive: { filePath: '' },
		syncDebounce: 0,
		...overrides.settings,
	};
	const state = {
		views: [
			createView('work', '💼 工作任务', '工作内容'),
			createView('personal', '👤 个人任务', '个人内容'),
		],
		archives: { work: [], personal: [] },
		saveCalls: 0,
		...overrides.state,
	};
	return {
		settings,
		state,
		getSettings: () => settings,
		getCurrentView: () => state.views[0]?.id ?? '',
		getTaskViews: () => state.views,
		getView: (id) => state.views.find((view) => view.id === id),
		getArchive: (id) => state.archives[id] ?? [],
		async saveNow() {
			state.saveCalls += 1;
		},
		dispatch(action) {
			if (action.type !== 'UPDATE_SETTINGS') return;
			if (action.payload.syncFolder !== undefined) settings.syncFolder = action.payload.syncFolder;
			if (action.payload.viewSyncTargets) {
				for (const [id, target] of Object.entries(action.payload.viewSyncTargets))
					settings.viewSyncTargets[id] = { ...target };
			}
			if (action.payload.archive) settings.archive = { ...action.payload.archive };
		},
	};
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureConsoleErrors(errors, operation) {
	const originalError = console.error;
	console.error = (...args) => errors.push(args);
	try {
		return await operation();
	} finally {
		console.error = originalError;
	}
}

test('initialization automatically creates one owned note per task type plus archive', async () => {
	const notices = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault();
	const store = createStore();
	const service = new VaultSyncService(vault, store);

	await service.initialize();

	assert.equal(vault.files.has('X-aulyc看板/工作任务.md'), true);
	assert.equal(vault.files.has('X-aulyc看板/个人任务.md'), true);
	assert.equal(vault.files.has('X-aulyc看板/归档任务.md'), true);
	assert.match(vault.files.get('X-aulyc看板/工作任务.md').content, /工作内容/);
	assert.match(vault.files.get('X-aulyc看板/工作任务.md').content, /aulyckanban:view=work/);
	assert.match(vault.files.get('X-aulyc看板/归档任务.md').content, /aulyckanban:archive/);
	assert.equal(store.settings.viewSyncTargets.work.filePath, 'X-aulyc看板/工作任务.md');
	assert.equal(store.settings.archive.filePath, 'X-aulyc看板/归档任务.md');
	assert.equal(notices.length, 0);
});

test('a task containing the managed end marker does not create unbounded history copies', async () => {
	const notices = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault();
	const store = createStore({
		settings: { viewSyncTargets: { work: { filePath: '' } } },
		state: {
			views: [
				createView('work', '💼 工作任务', '正文 <!-- XAULYC_KANBAN:END --> 仍然属于任务内容'),
			],
			archives: { work: [] },
		},
	});
	const service = new VaultSyncService(vault, store);
	await service.initialize();

	for (let index = 0; index < 3; index += 1) await service.syncCurrentView(true);

	const history = [...vault.files.keys()].filter((path) => path.includes('/历史同步内容/'));
	assert.deepEqual(history, []);
	assert.equal(
		vault.files.get('X-aulyc看板/工作任务.md').content.match(/<!-- XAULYC_KANBAN:END -->/gu)
			?.length,
		2,
	);
});

test('initialization moves legacy mixed content to history and creates an exact managed mirror', async () => {
	const notices = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault({
		'X-aulyc看板/工作任务.md':
			'用户前言\n\n<!-- XAULYC_KANBAN:START -->\n旧内容\n<!-- XAULYC_KANBAN:END -->',
	});
	const store = createStore();
	const service = new VaultSyncService(vault, store);

	await service.initialize();

	const content = vault.files.get('X-aulyc看板/工作任务.md').content;
	assert.doesNotMatch(content, /用户前言|旧内容/);
	assert.match(content, /^<!-- XAULYC_KANBAN:START -->/);
	assert.match(content, /工作内容/);
	assert.match(content, /aulyckanban:view=work/);
	const preserved = [...vault.files.entries()].find(([path]) =>
		path.startsWith('X-aulyc看板/历史同步内容/工作任务-'),
	);
	assert.ok(preserved);
	assert.match(preserved[1].content, /^用户前言/);
	assert.match(preserved[1].content, /旧内容/);
});

test('force refresh saves the current board and rebuilds every managed note', async () => {
	const notices = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault();
	const store = createStore();
	const service = new VaultSyncService(vault, store);
	await service.initialize();

	store.state.views[0].columns[0].tasks[0].content = '强制刷新后的工作内容';
	const workFile = vault.files.get('X-aulyc看板/工作任务.md');
	workFile.content = `旧版残留内容\n\n${workFile.content}`;

	const result = await service.forceSyncAll();

	assert.equal(store.state.saveCalls, 1);
	assert.equal(result.syncedCount, 3);
	assert.equal(result.totalCount, 3);
	assert.match(vault.files.get('X-aulyc看板/工作任务.md').content, /^<!-- XAULYC_KANBAN:START -->/);
	assert.match(vault.files.get('X-aulyc看板/工作任务.md').content, /强制刷新后的工作内容/);
	assert.doesNotMatch(vault.files.get('X-aulyc看板/工作任务.md').content, /旧版残留内容/);
	assert.equal(
		[...vault.files.keys()].some((path) => path.startsWith('X-aulyc看板/历史同步内容/工作任务-')),
		true,
	);
});

test('force refresh reports write failures and keeps the synchronization queue usable', async () => {
	const notices = [];
	const errors = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault();
	const store = createStore();
	const service = new VaultSyncService(vault, store);
	await service.initialize();

	const process = vault.process.bind(vault);
	let shouldFail = true;
	vault.process = async (file, transform) => {
		if (shouldFail && file.path === 'X-aulyc看板/工作任务.md') {
			shouldFail = false;
			throw new Error('simulated force refresh failure');
		}
		await process(file, transform);
	};

	await captureConsoleErrors(errors, () =>
		assert.rejects(service.forceSyncAll(), /工作任务.*simulated force refresh failure/),
	);
	assert.equal(errors.length, 1);
	const retry = await service.forceSyncAll();
	assert.equal(retry.syncedCount, 3);
	assert.equal(store.state.saveCalls, 2);
});

test('legacy content is restored to its original path if exact mirror creation fails', async () => {
	const notices = [];
	const errors = [];
	const VaultSyncService = await loadSyncService(notices, errors);
	const originalContent =
		'用户前言\n\n<!-- XAULYC_KANBAN:START -->\n旧内容\n<!-- XAULYC_KANBAN:END -->';
	const vault = createVault({ 'X-aulyc看板/工作任务.md': originalContent });
	const create = vault.create.bind(vault);
	let failMirrorCreation = true;
	vault.create = async (path, content) => {
		if (path === 'X-aulyc看板/工作任务.md' && failMirrorCreation) {
			failMirrorCreation = false;
			throw new Error('simulated mirror creation failure');
		}
		return create(path, content);
	};
	const service = new VaultSyncService(vault, createStore());

	await service.initialize();

	assert.equal(vault.files.get('X-aulyc看板/工作任务.md').content, originalContent);
	assert.equal(
		[...vault.files.keys()].some((path) => path.startsWith('X-aulyc看板/历史同步内容/')),
		false,
	);
	assert.equal(failMirrorCreation, false);
	assert.equal(errors.length, 0);
});

test('renaming a task type renames its owned note and updates the stored target', async () => {
	const notices = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault();
	const store = createStore();
	const service = new VaultSyncService(vault, store);
	await service.initialize();

	store.state.views[0].title = '客户项目';
	service.scheduleSyncAllViews();
	await delay(15);

	assert.equal(vault.files.has('X-aulyc看板/工作任务.md'), false);
	assert.equal(vault.files.has('X-aulyc看板/客户项目.md'), true);
	assert.equal(store.settings.viewSyncTargets.work.filePath, 'X-aulyc看板/客户项目.md');
});

test('changing the single sync folder moves every managed note', async () => {
	const notices = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault();
	const store = createStore();
	const service = new VaultSyncService(vault, store);
	await service.initialize();

	store.settings.syncFolder = '新同步目录';
	service.scheduleSyncAllViews();
	await delay(15);

	assert.equal(vault.files.has('X-aulyc看板/工作任务.md'), false);
	assert.equal(vault.files.has('X-aulyc看板/归档任务.md'), false);
	assert.equal(vault.files.has('新同步目录/工作任务.md'), true);
	assert.equal(vault.files.has('新同步目录/个人任务.md'), true);
	assert.equal(vault.files.has('新同步目录/归档任务.md'), true);
});

test('deleting a task type moves its owned note into a recovery folder', async () => {
	const notices = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault();
	const store = createStore();
	const service = new VaultSyncService(vault, store);
	await service.initialize();

	store.state.views = store.state.views.filter((view) => view.id !== 'personal');
	delete store.settings.viewSyncTargets.personal;
	delete store.state.archives.personal;
	service.scheduleSyncAllViews();
	await delay(15);

	assert.equal(vault.files.has('X-aulyc看板/个人任务.md'), false);
	const recovered = [...vault.files.keys()].find((path) =>
		path.startsWith('X-aulyc看板/已删除任务类型/个人任务-'),
	);
	assert.ok(recovered);
	assert.match(vault.files.get(recovered).content, /个人内容/);
});

test('a conflicting user note is preserved and the managed note receives a unique path', async () => {
	const notices = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault({ 'X-aulyc看板/工作任务.md': '这是用户自己的笔记' });
	const store = createStore();
	const service = new VaultSyncService(vault, store);

	await service.initialize();

	assert.equal(vault.files.get('X-aulyc看板/工作任务.md').content, '这是用户自己的笔记');
	assert.equal(store.settings.viewSyncTargets.work.filePath, 'X-aulyc看板/工作任务 (2).md');
	assert.match(vault.files.get('X-aulyc看板/工作任务 (2).md').content, /工作内容/);
});

test('a transient Vault read failure is contained instead of rejecting plugin initialization', async () => {
	const notices = [];
	const errors = [];
	const VaultSyncService = await loadSyncService(notices);
	const vault = createVault({ 'X-aulyc看板/归档任务.md': 'existing' });
	vault.cachedRead = async () => {
		throw new Error('temporary read failure');
	};
	const service = new VaultSyncService(vault, createStore());

	await captureConsoleErrors(errors, () => assert.doesNotReject(service.initialize()));
	assert.equal(errors.length, 1);
});
