import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

async function loadBackupService(notices) {
	const module = await loadSourceModule(
		new URL('../src/services/backupService.ts', import.meta.url),
		{
			label: 'backup-service',
			mocks: {
				obsidian: {
					Notice: class {
						constructor(message) {
							notices.push(message);
						}
					},
				},
			},
		},
	);
	return module.BackupService;
}

function createBoard() {
	return {
		views: [
			{
				id: 'work',
				title: '工作',
				order: 0,
				columns: [
					{
						id: 'base',
						title: '基础',
						order: 0,
						tasks: [
							{
								id: 'task-1',
								content: '备份任务',
								completed: false,
								createdAt: '2026-01-01T00:00:00.000Z',
							},
						],
					},
				],
			},
		],
		archives: { work: { tasks: [] } },
	};
}

function createHost(elementFactory) {
	return {
		createEl: elementFactory,
	};
}

test('export serializes the current board and revokes the temporary download URL', async () => {
	const notices = [];
	const BackupService = await loadBackupService(notices);
	const originalBlob = globalThis.Blob;
	const originalURL = globalThis.URL;
	const anchors = [];
	const blobs = [];
	const revoked = [];
	globalThis.Blob = class {
		constructor(parts, options) {
			this.parts = parts;
			this.options = options;
			blobs.push(this);
		}
	};
	globalThis.URL = {
		createObjectURL(blob) {
			assert.equal(blob, blobs[0]);
			return 'blob:backup';
		},
		revokeObjectURL(url) {
			revoked.push(url);
		},
	};
	const host = createHost((tagName) => {
		assert.equal(tagName, 'a');
		const anchor = {
			href: '',
			download: '',
			clickCount: 0,
			click() {
				this.clickCount += 1;
			},
			detach() {},
		};
		anchors.push(anchor);
		return anchor;
	});

	try {
		const board = createBoard();
		const service = new BackupService({ getBoardData: () => board });
		service.exportBackup(host);

		assert.equal(blobs.length, 1);
		assert.deepEqual(blobs[0].options, { type: 'application/json' });
		const exported = JSON.parse(blobs[0].parts.join(''));
		assert.deepEqual(exported.views, board.views);
		assert.deepEqual(exported.archives, board.archives);
		assert.equal(exported.version, '4.0');
		assert.match(exported.backupTime, /^\d{4}-\d{2}-\d{2}T/);
		assert.equal(anchors[0].href, 'blob:backup');
		assert.match(anchors[0].download, /^aulycKanban-backup-.+\.json$/);
		assert.equal(anchors[0].clickCount, 1);
		assert.deepEqual(revoked, ['blob:backup']);
		assert.deepEqual(notices, []);
	} finally {
		globalThis.Blob = originalBlob;
		globalThis.URL = originalURL;
	}
});

test('export reports store failures without creating a download', async () => {
	const notices = [];
	const BackupService = await loadBackupService(notices);
	let createElementCalls = 0;
	const host = createHost(() => {
		createElementCalls += 1;
	});

	const service = new BackupService({
		getBoardData() {
			throw new Error('store unavailable');
		},
	});
	service.exportBackup(host);
	assert.equal(createElementCalls, 0);
	assert.equal(notices.length, 1);
	assert.match(notices[0], /store unavailable/);
});

function createImportHarness() {
	let changeListener;
	const input = {
		type: '',
		accept: '',
		files: [],
		clickCount: 0,
		addEventListener(eventName, listener) {
			assert.equal(eventName, 'change');
			changeListener = listener;
		},
		click() {
			this.clickCount += 1;
		},
		detach() {},
	};
	return {
		input,
		async dispatchFile(file) {
			input.files = file ? [file] : [];
			changeListener({ target: input });
			await new Promise((resolve) => setImmediate(resolve));
		},
	};
}

async function prepareImport(overrides = {}) {
	const notices = [];
	const actions = [];
	let saveCalls = 0;
	const BackupService = await loadBackupService(notices);
	const harness = createImportHarness();
	const host = createHost((tagName) => {
		assert.equal(tagName, 'input');
		return harness.input;
	});
	const store = {
		dispatch: (action) => actions.push(action),
		async saveNow() {
			saveCalls += 1;
		},
		...overrides,
	};
	const service = new BackupService(store);
	service.importBackup(host);
	return {
		actions,
		harness,
		notices,
		restoreDocument: () => {},
		getSaveCalls: () => saveCalls,
	};
}

test('import validates, normalizes, persists, and confirms a complete backup', async () => {
	const context = await prepareImport();
	try {
		const board = createBoard();
		delete board.views[0].columns[0].tasks[0].createdAt;
		await context.harness.dispatchFile({ text: async () => JSON.stringify(board) });

		assert.equal(context.harness.input.type, 'file');
		assert.equal(context.harness.input.accept, '.json');
		assert.equal(context.harness.input.clickCount, 1);
		assert.equal(context.actions.length, 1);
		assert.equal(context.actions[0].type, 'SET_BOARD_DATA');
		assert.equal(
			context.actions[0].payload.board.views[0].columns[0].tasks[0].createdAt,
			'1970-01-01T00:00:00.000Z',
		);
		assert.equal(context.getSaveCalls(), 1);
		assert.equal(context.notices.length, 1);
	} finally {
		context.restoreDocument();
	}
});

test('import rejects a malformed task without mutating or saving the board', async () => {
	const context = await prepareImport();
	try {
		const board = createBoard();
		delete board.views[0].columns[0].tasks[0].content;
		await context.harness.dispatchFile({ text: async () => JSON.stringify(board) });
		assert.deepEqual(context.actions, []);
		assert.equal(context.getSaveCalls(), 0);
		assert.equal(context.notices.length, 1);
	} finally {
		context.restoreDocument();
	}
});

async function assertImportRejected(board, duplicateId) {
	const context = await prepareImport();
	try {
		await context.harness.dispatchFile({ text: async () => JSON.stringify(board) });
		assert.deepEqual(context.actions, []);
		assert.equal(context.getSaveCalls(), 0);
		assert.equal(context.notices.length, 1);
		assert.match(context.notices[0], new RegExp(duplicateId));
	} finally {
		context.restoreDocument();
	}
}

test('import rejects duplicate task type ids before replacing the current board', async () => {
	const board = createBoard();
	board.views.push({
		...structuredClone(board.views[0]),
		title: '重复任务类型',
		order: 1,
	});
	await assertImportRejected(board, 'work');
});

test('import rejects duplicate quadrant ids before shared definitions can discard tasks', async () => {
	const board = createBoard();
	board.views[0].columns.push({
		id: 'base',
		title: '重复象限',
		order: 1,
		tasks: [
			{
				id: 'task-2',
				content: '不能静默丢失的任务',
				completed: false,
				createdAt: '2026-01-02T00:00:00.000Z',
			},
		],
	});
	await assertImportRejected(board, 'base');
});

test('import rejects duplicate task ids across active and archived tasks in one task type', async () => {
	const board = createBoard();
	board.archives.work.tasks.push({
		id: 'task-1',
		content: '重复归档任务',
		completed: true,
		createdAt: '2026-01-02T00:00:00.000Z',
		archivedAt: '2026-01-03T00:00:00.000Z',
	});
	await assertImportRejected(board, 'task-1');
});

test('import rejects duplicate active task ids before edits can target the wrong card', async () => {
	const board = createBoard();
	board.views[0].columns[0].tasks.push({
		...structuredClone(board.views[0].columns[0].tasks[0]),
		content: '相同 ID 的第二张卡片',
	});
	await assertImportRejected(board, 'task-1');
});

test('import allows shared quadrant and task ids when their task type coordinates differ', async () => {
	const context = await prepareImport();
	try {
		const board = createBoard();
		board.views.push({
			id: 'personal',
			title: '个人',
			order: 1,
			columns: [
				{
					id: 'base',
					title: '基础',
					order: 0,
					tasks: [structuredClone(board.views[0].columns[0].tasks[0])],
				},
			],
		});
		board.archives.personal = { tasks: [] };

		await context.harness.dispatchFile({ text: async () => JSON.stringify(board) });

		assert.equal(context.actions.length, 1);
		assert.equal(context.actions[0].payload.board.views.length, 2);
		assert.equal(context.getSaveCalls(), 1);
	} finally {
		context.restoreDocument();
	}
});

test('import reports unreadable JSON and ignores an empty file selection', async () => {
	const context = await prepareImport();
	try {
		await context.harness.dispatchFile(null);
		assert.equal(context.notices.length, 0);
		await context.harness.dispatchFile({ text: async () => '{invalid json' });
		assert.deepEqual(context.actions, []);
		assert.equal(context.getSaveCalls(), 0);
		assert.equal(context.notices.length, 1);
		assert.match(context.notices[0], /Unexpected|JSON/);
	} finally {
		context.restoreDocument();
	}
});

test('import rejects a newer declared backup version without mutating or saving', async () => {
	const context = await prepareImport();
	try {
		await context.harness.dispatchFile({
			text: async () => JSON.stringify({ ...createBoard(), version: '5.0' }),
		});
		assert.deepEqual(context.actions, []);
		assert.equal(context.getSaveCalls(), 0);
		assert.equal(context.notices.length, 1);
		assert.match(context.notices[0], /更高版本/);
	} finally {
		context.restoreDocument();
	}
});

test('import reports migration when accepting a declared 2.0 backup', async () => {
	const context = await prepareImport();
	try {
		await context.harness.dispatchFile({
			text: async () =>
				JSON.stringify({
					version: '2.0',
					work: { columns: createBoard().views[0].columns },
					personal: { columns: createBoard().views[0].columns },
					workArchive: { tasks: [] },
					personalArchive: { tasks: [] },
				}),
		});
		assert.equal(context.actions.length, 1);
		assert.equal(context.getSaveCalls(), 1);
		assert.match(context.notices[0], /2\.0/);
	} finally {
		context.restoreDocument();
	}
});

test('import distinguishes unsupported versions from declared shape mismatches', async () => {
	for (const [payload, expectedNotice] of [
		[{ ...createBoard(), version: '3.0' }, /不支持.*3\.0/],
		[{ ...createBoard(), version: '2.0' }, /不匹配/],
	]) {
		const context = await prepareImport();
		try {
			await context.harness.dispatchFile({ text: async () => JSON.stringify(payload) });
			assert.deepEqual(context.actions, []);
			assert.equal(context.getSaveCalls(), 0);
			assert.match(context.notices[0], expectedNotice);
		} finally {
			context.restoreDocument();
		}
	}
});
