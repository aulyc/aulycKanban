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

function installDocument(elementFactory) {
	const originalDocument = globalThis.document;
	globalThis.document = {
		createElement: elementFactory,
	};
	return () => {
		globalThis.document = originalDocument;
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
	const restoreDocument = installDocument((tagName) => {
		assert.equal(tagName, 'a');
		const anchor = {
			href: '',
			download: '',
			clickCount: 0,
			click() {
				this.clickCount += 1;
			},
		};
		anchors.push(anchor);
		return anchor;
	});

	try {
		const board = createBoard();
		const service = new BackupService({ getBoardData: () => board });
		await service.exportBackup();

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
		restoreDocument();
		globalThis.Blob = originalBlob;
		globalThis.URL = originalURL;
	}
});

test('export reports store failures without creating a download', async () => {
	const notices = [];
	const BackupService = await loadBackupService(notices);
	let createElementCalls = 0;
	const restoreDocument = installDocument(() => {
		createElementCalls += 1;
	});

	try {
		const service = new BackupService({
			getBoardData() {
				throw new Error('store unavailable');
			},
		});
		await service.exportBackup();
		assert.equal(createElementCalls, 0);
		assert.equal(notices.length, 1);
		assert.match(notices[0], /store unavailable/);
	} finally {
		restoreDocument();
	}
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
	};
	return {
		input,
		async dispatchFile(file) {
			input.files = file ? [file] : [];
			await changeListener({ target: input });
		},
	};
}

async function prepareImport(overrides = {}) {
	const notices = [];
	const actions = [];
	let saveCalls = 0;
	const BackupService = await loadBackupService(notices);
	const harness = createImportHarness();
	const restoreDocument = installDocument((tagName) => {
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
	await service.importBackup();
	return {
		actions,
		harness,
		notices,
		restoreDocument,
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
