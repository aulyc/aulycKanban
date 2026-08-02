import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

let activeSetup;

class MockPlugin {
	constructor(app) {
		this.app = app;
		this.manifest = { version: '2.8.2', minAppVersion: '1.5.0' };
		this.registeredViews = [];
		this.ribbonItems = [];
		this.commands = [];
		this.settingTabs = [];
	}

	async loadData() {
		return null;
	}

	async saveData() {}

	registerView(type, factory) {
		this.registeredViews.push({ type, factory });
	}

	addRibbonIcon(icon, title, callback) {
		this.ribbonItems.push({ icon, title, callback });
	}

	addCommand(command) {
		this.commands.push(command);
	}

	addSettingTab(tab) {
		this.settingTabs.push(tab);
	}
}

class MockRepository {
	constructor(loadData, saveData) {
		this.loadData = loadData;
		this.saveData = saveData;
		this.setup = activeSetup;
		this.setup.repositories.push(this);
	}

	async load() {
		return this.setup.loadResult;
	}

	async save(settings, board) {
		this.setup.saves.push({ settings, board });
		if (this.setup.saveError) throw this.setup.saveError;
	}
}

class MockStore {
	constructor(settings, board, plugin) {
		this.settings = settings;
		this.board = board;
		this.plugin = plugin;
		this.listeners = new Set();
		this.actions = [];
		this.destroyCount = 0;
		this.lastActionMutatedData = false;
		this.lastActionType = null;
		this.lastMutatedViewId = null;
		activeSetup.stores.push(this);
	}

	subscribe(listener) {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
			activeSetup.unsubscribeCount += 1;
		};
	}

	emitMutation({ mutated = true, actionType = 'ADD_TASK', viewId = null } = {}) {
		this.lastActionMutatedData = mutated;
		this.lastActionType = actionType;
		this.lastMutatedViewId = viewId;
		for (const listener of this.listeners) listener();
	}

	getCurrentView() {
		return this.settings.currentView;
	}

	getSettings() {
		return this.settings;
	}

	getBoardData() {
		return this.board;
	}

	dispatch(action) {
		this.actions.push(action);
		if (action.type === 'SWITCH_VIEW') this.settings.currentView = action.payload.view;
	}

	destroy() {
		this.destroyCount += 1;
	}
}

class MockSyncService {
	constructor(vault, store) {
		this.vault = vault;
		this.store = store;
		this.initializeCalls = [];
		this.viewSyncs = [];
		this.allSyncCount = 0;
		this.flushCount = 0;
		activeSetup.syncServices.push(this);
	}

	async initialize(silent) {
		this.initializeCalls.push(silent);
		if (activeSetup.syncInitializeError) throw activeSetup.syncInitializeError;
	}

	scheduleSyncView(viewId) {
		this.viewSyncs.push(viewId);
	}

	scheduleSyncAllViews() {
		this.allSyncCount += 1;
	}

	flush() {
		this.flushCount += 1;
	}
}

class MockKanbanView {
	constructor(leaf, plugin) {
		this.leaf = leaf;
		this.plugin = plugin;
		this.focusCount = 0;
	}

	focusBoard() {
		this.focusCount += 1;
	}
}

class MockSettingTab {
	constructor(app, plugin) {
		this.app = app;
		this.plugin = plugin;
	}
}

const { default: KanbanPlugin } = await loadSourceModule(
	new URL('../src/main.ts', import.meta.url),
	{
		label: 'plugin-main',
		mocks: {
			obsidian: {
				Notice: class {
					constructor(message) {
						activeSetup.notices.push(message);
					}
				},
				Plugin: MockPlugin,
				WorkspaceLeaf: class {},
			},
			'./constants': { VIEW_TYPE_KANBAN: 'aulyckanban-view' },
			'./i18n': {
				initI18n: (locale) => activeSetup.initializedLocales.push(locale),
				t: (key) => key,
			},
			'./ui/KanbanView': { KanbanView: MockKanbanView },
			'./ui/KanbanSettingTab': { KanbanSettingTab: MockSettingTab },
			'./store': { KanbanStore: MockStore },
			'./services/syncService': { VaultSyncService: MockSyncService },
			'./services/repository': { PluginDataRepository: MockRepository },
			'./utils/syncTarget': {
				getMutationSyncTarget(actionType, currentView, mutatedView) {
					return actionType === 'CLEAR_ALL_DATA'
						? { kind: 'all' }
						: { kind: 'view', viewId: mutatedView ?? currentView };
				},
			},
		},
	},
);

function createLeaf() {
	return {
		view: null,
		viewStates: [],
		async setViewState(state) {
			this.viewStates.push(state);
			this.view = new MockKanbanView(this, null);
		},
	};
}

function createHarness({ htmlLocale = 'zh-CN' } = {}) {
	const setup = {
		initializedLocales: [],
		loadResult: {
			settings: { currentView: 'work' },
			board: { views: [], archives: {} },
		},
		notices: [],
		repositories: [],
		saves: [],
		stores: [],
		syncServices: [],
		unsubscribeCount: 0,
		syncInitializeError: null,
		saveError: null,
	};
	activeSetup = setup;
	const workspace = {
		containerEl: { ownerDocument: { documentElement: { lang: htmlLocale } } },
		leaves: [],
		rightLeaf: null,
		tabLeaf: null,
		revealed: [],
		getLeafCalls: [],
		onLayoutReady(callback) {
			workspace.layoutReadyCallback = callback;
		},
		getLeavesOfType: () => workspace.leaves,
		getRightLeaf: () => workspace.rightLeaf,
		getLeaf(mode) {
			workspace.getLeafCalls.push(mode);
			return workspace.tabLeaf;
		},
		setActiveLeaf(leaf, options) {
			workspace.revealed.push(leaf);
			workspace.activeLeafOptions = options;
		},
	};
	const app = {
		vault: {},
		workspace,
	};
	return { app, plugin: new KanbanPlugin(app), setup, workspace };
}

async function captureConsoleErrors(operation) {
	const errors = [];
	const original = console.error;
	console.error = (...args) => errors.push(args);
	try {
		await operation();
	} finally {
		console.error = original;
	}
	return errors;
}

test('plugin load registers entry points and routes only data mutations to managed-note sync', async () => {
	const harness = createHarness();
	await harness.plugin.onload();
	const store = harness.setup.stores[0];
	const sync = harness.setup.syncServices[0];

	assert.deepEqual(harness.setup.initializedLocales, ['zh-CN']);
	assert.deepEqual(sync.initializeCalls, [true]);
	assert.equal(harness.plugin.registeredViews[0].type, 'aulyckanban-view');
	assert.ok(harness.plugin.registeredViews[0].factory({}) instanceof MockKanbanView);
	assert.deepEqual(
		harness.plugin.commands.map((command) => command.id),
		['open-board', 'focus-work', 'focus-personal'],
	);
	assert.equal(harness.plugin.ribbonItems[0].icon, 'list-todo');
	assert.ok(harness.plugin.settingTabs[0] instanceof MockSettingTab);

	store.emitMutation({ mutated: false });
	assert.deepEqual(sync.viewSyncs, []);
	store.emitMutation({ viewId: 'personal' });
	assert.deepEqual(sync.viewSyncs, ['personal']);
	store.emitMutation({ actionType: 'CLEAR_ALL_DATA' });
	assert.equal(sync.allSyncCount, 1);

	await harness.plugin.persistData();
	assert.deepEqual(harness.setup.saves, [{ settings: store.settings, board: store.board }]);
	harness.plugin.onunload();
	assert.equal(harness.setup.unsubscribeCount, 1);
	assert.equal(store.destroyCount, 1);
	assert.equal(sync.flushCount, 1);
});

test('plugin load contains managed-note initialization failures and keeps commands available', async () => {
	const harness = createHarness();
	harness.setup.syncInitializeError = new Error('sync unavailable');
	const errors = await captureConsoleErrors(() => harness.plugin.onload());

	assert.equal(errors.length, 1);
	assert.match(String(errors[0][0]), /Failed to initialize managed notes/);
	assert.equal(harness.plugin.commands.length, 3);
	harness.plugin.onunload();
});

test('registered controls activate existing or new board leaves and select explicit task types', async () => {
	const harness = createHarness({ htmlLocale: 'en-GB' });
	await harness.plugin.onload();
	assert.deepEqual(harness.setup.initializedLocales, ['en-GB']);

	const existingLeaf = createLeaf();
	existingLeaf.view = new MockKanbanView(existingLeaf, harness.plugin);
	harness.workspace.leaves = [existingLeaf];
	await harness.plugin.ribbonItems[0].callback();
	assert.equal(harness.workspace.revealed.at(-1), existingLeaf);
	assert.deepEqual(harness.workspace.activeLeafOptions, { focus: true });
	assert.equal(existingLeaf.view.focusCount, 1);

	const fallbackLeaf = createLeaf();
	harness.workspace.leaves = [];
	harness.workspace.rightLeaf = null;
	harness.workspace.tabLeaf = fallbackLeaf;
	harness.plugin.commands.find((command) => command.id === 'open-board').callback();
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(harness.workspace.getLeafCalls, ['tab']);
	assert.deepEqual(fallbackLeaf.viewStates, [{ type: 'aulyckanban-view', active: true }]);
	assert.equal(fallbackLeaf.view.focusCount, 1);

	harness.workspace.leaves = [existingLeaf];
	await harness.plugin.commands.find((command) => command.id === 'focus-work').callback();
	await harness.plugin.commands.find((command) => command.id === 'focus-personal').callback();
	assert.deepEqual(harness.setup.stores[0].actions.slice(-2), [
		{ type: 'SWITCH_VIEW', payload: { view: 'work' } },
		{ type: 'SWITCH_VIEW', payload: { view: 'personal' } },
	]);
	harness.plugin.onunload();
});

test('persist failures notify once while silent retries still reject', async () => {
	const harness = createHarness({ htmlLocale: '' });
	await harness.plugin.onload();
	assert.deepEqual(harness.setup.initializedLocales, ['en']);
	harness.setup.saveError = new Error('disk full');

	const errors = await captureConsoleErrors(async () => {
		await assert.rejects(harness.plugin.persistData(), /disk full/);
		await assert.rejects(harness.plugin.persistData(false), /disk full/);
	});

	assert.equal(errors.length, 2);
	assert.deepEqual(harness.setup.notices, ['save.fail']);
	harness.plugin.onunload();
});

test('activation errors are contained and unloading an unopened plugin is safe', async () => {
	const harness = createHarness();
	harness.workspace.getLeavesOfType = () => {
		throw new Error('workspace unavailable');
	};
	const errors = await captureConsoleErrors(() => harness.plugin.activateView());
	assert.equal(errors.length, 1);
	assert.match(String(errors[0][0]), /Failed to activate view/);

	const unopened = createHarness().plugin;
	assert.doesNotThrow(() => unopened.onunload());
});
