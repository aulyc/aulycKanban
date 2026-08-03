import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

const renderedSettings = [];
const renderedConfirmModals = [];
const renderedAboutModals = [];
const renderedNotices = [];
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

class MockElement {
	empty() {}
	createDiv() {
		return { setText() {} };
	}
}

class MockPluginSettingTab {
	constructor(app, plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = app.containerEl;
	}
}

class MockSetting {
	constructor() {
		this.controls = [];
		this.controlClasses = new Set();
		this.controlChildren = [];
		this.controlEl = {
			classList: {
				add: (value) => this.controlClasses.add(value),
				toggle: (value, enabled) => {
					if (enabled) this.controlClasses.add(value);
					else this.controlClasses.delete(value);
				},
			},
			createSpan: (options) => {
				const span = { options };
				this.controlChildren.push(span);
				return span;
			},
		};
		this.renderedAt = renderedSettings.push(this);
	}
	setHeading() {
		this.heading = true;
		return this;
	}
	setName(value) {
		this.name = value;
		return this;
	}
	setDesc(value) {
		this.desc = value;
		return this;
	}
	addButton(callback) {
		const classes = new Set();
		const button = {
			buttonEl: {
				classList: { add: (value) => classes.add(value) },
				createSpan: (options) => {
					button.accessibleLabel = options;
					return {};
				},
			},
			classes,
			setIcon: (value) => {
				button.icon = value;
				return button;
			},
			setButtonText: (value) => {
				button.text = value;
				return button;
			},
			setDisabled: (value) => {
				button.disabled = value;
				return button;
			},
			setWarning: () => button,
			setDestructive: () => {
				button.destructive = true;
				return button;
			},
			onClick: (handler) => {
				button.onClickHandler = handler;
				return button;
			},
		};
		callback(button);
		this.controls.push(button);
		return this;
	}
	addDropdown(callback) {
		const classes = new Set();
		const dropdown = {
			options: new Map(),
			classes,
			selectEl: {
				classList: { add: (value) => classes.add(value) },
			},
			addOption: (value, label) => {
				dropdown.options.set(value, label);
				return dropdown;
			},
			setValue: (value) => {
				dropdown.value = value;
				return dropdown;
			},
			onChange: (handler) => {
				dropdown.onChangeHandler = handler;
				return dropdown;
			},
		};
		callback(dropdown);
		this.dropdown = dropdown;
		return this;
	}
	addText(callback) {
		const listeners = new Map();
		const classes = new Set();
		const text = {
			inputEl: {
				value: '',
				classList: { add: (value) => classes.add(value) },
				getBoundingClientRect: () => ({ width: 248 }),
				ownerDocument: {
					defaultView: {
						Event: class {
							constructor(type) {
								this.type = type;
							}
						},
					},
				},
				addEventListener: (name, listener) => listeners.set(name, listener),
				removeEventListener: (name, listener) => {
					if (listeners.get(name) === listener) listeners.delete(name);
				},
				dispatchEvent: (event) => {
					listeners.get(event.type)?.(event);
					return true;
				},
			},
			classes,
			listeners,
			setPlaceholder: (value) => {
				text.placeholder = value;
				return text;
			},
			setValue: (value) => {
				text.value = value;
				text.inputEl.value = value;
				return text;
			},
			onChange: (handler) => {
				text.onChangeHandler = handler;
				return text;
			},
		};
		callback(text);
		this.text = text;
		return this;
	}
}

class MockAboutModal {
	constructor(app, version, minAppVersion) {
		this.app = app;
		this.version = version;
		this.minAppVersion = minAppVersion;
		renderedAboutModals.push(this);
	}
	open() {
		this.opened = true;
	}
}

class MockConfirmModal {
	constructor(app, options) {
		this.app = app;
		this.options = options;
		renderedConfirmModals.push(this);
	}
	open() {
		this.opened = true;
	}
}

const { KanbanSettingTab } = await loadSourceModule(
	new URL('../src/ui/KanbanSettingTab.ts', import.meta.url),
	{
		label: 'kanban-setting-tab',
		mocks: {
			obsidian: {
				Notice: class {
					constructor(message) {
						renderedNotices.push(message);
					}
				},
				normalizePath: (value) => value,
				PluginSettingTab: MockPluginSettingTab,
				Setting: MockSetting,
			},
			'../i18n': {
				t: (key) => (key === 'settings.sync.force.success' ? 'sync success {count}' : key),
			},
			'../services/backupService': { BackupService: class {} },
			'../utils/noteSync': {
				normalizeSyncFolder: (value) => {
					const folder = value
						.trim()
						.replace(/\/{2,}/g, '/')
						.replace(/^\/+|\/+$/g, '');
					return folder || 'X-aulyc看板';
				},
			},
			'./AboutModal': { AboutModal: MockAboutModal },
			'./ClearDataModal': { ClearDataModal: class {} },
			'./ConfirmModal': { ConfirmModal: MockConfirmModal },
		},
	},
);

function createHarness() {
	const settings = {
		syncFolder: 'X-aulyc看板',
		viewSyncTargets: { work: { filePath: '旧/工作.md' } },
		archive: { filePath: '旧/归档.md' },
	};
	const syncCalls = { all: 0, force: 0 };
	const store = {
		getSettings: () => settings,
		getTaskViews: () => [{ id: 'work', title: '工作任务' }],
		dispatch(action) {
			if (action.type !== 'UPDATE_SETTINGS') return;
			if (action.payload.syncFolder !== undefined) settings.syncFolder = action.payload.syncFolder;
		},
		async saveNow() {},
	};
	const plugin = {
		manifest: { version: '2.8.1-beta.6', minAppVersion: '1.5.0' },
		store,
		syncService: {
			scheduleSyncAllViews: () => {
				syncCalls.all += 1;
			},
			forceSyncAll: async () => {
				syncCalls.force += 1;
				return { syncedCount: 3, totalCount: 3 };
			},
		},
	};
	const app = {
		containerEl: new MockElement(),
		vault: {
			getRoot: () => ({
				children: [
					{ path: 'Alpha', children: [] },
					{ path: 'Beta', children: [] },
					{ path: '工作', children: [] },
					{ path: '项目', children: [] },
					{ path: 'Alpha/task.md' },
				],
			}),
			getAllLoadedFiles: () => {
				throw new Error('folder suggestions must not enumerate the whole vault');
			},
		},
	};
	const tab = new KanbanSettingTab(app, plugin);
	return { tab, settings, syncCalls };
}

test('declarative settings index every visible setting while legacy display remains available', () => {
	const { tab } = createHarness();
	const definitions = tab.getSettingDefinitions();
	const names = definitions.flatMap((definition) =>
		definition.type === 'group'
			? [definition.heading, ...(definition.items ?? []).map((item) => item.name)]
			: [definition.name],
	);

	assert.deepEqual(names, [
		'settings.dataManagement',
		'settings.backup.name',
		'settings.import.name',
		'settings.clear.name',
		'settings.sync',
		'settings.sync.folder.name',
		'settings.sync.force.name',
		'settings.about.name',
	]);
	assert.equal(typeof tab.display, 'function');
});

test('declarative setting renderers construct every indexed control', () => {
	const { tab } = createHarness();
	const definitions = tab.getSettingDefinitions();
	const items = definitions.flatMap((definition) =>
		definition.type === 'group' ? (definition.items ?? []) : [definition],
	);
	const rendered = items.map((item) => {
		const setting = new MockSetting();
		item.render(setting);
		return setting;
	});

	assert.equal(rendered.length, 6);
	assert.deepEqual(
		rendered.map(
			(setting) => setting.controls.length + (setting.dropdown ? 1 : 0) + (setting.text ? 1 : 0),
		),
		[1, 1, 1, 1, 1, 1],
	);
});

test('about setting opens an information card using current manifest metadata', () => {
	const { tab } = createHarness();
	const settingStart = renderedSettings.length;
	const modalStart = renderedAboutModals.length;
	tab.display();
	const aboutSetting = renderedSettings
		.slice(settingStart)
		.find((item) => item.name === 'settings.about.name');

	assert.ok(aboutSetting);
	assert.equal(aboutSetting.desc, 'settings.about.desc');
	assert.equal(aboutSetting.controls[0].icon, 'info');
	assert.deepEqual(aboutSetting.controls[0].accessibleLabel, {
		cls: 'aulyckanban-accessible-label',
		text: 'settings.about.name',
	});
	aboutSetting.controls[0].onClickHandler();

	const modal = renderedAboutModals[modalStart];
	assert.ok(modal);
	assert.equal(modal.version, '2.8.1-beta.6');
	assert.equal(modal.minAppVersion, '1.5.0');
	assert.equal(modal.opened, true);
});

test('settings action buttons share one fixed width', () => {
	const { tab } = createHarness();
	const start = renderedSettings.length;
	tab.display();
	const settings = renderedSettings.slice(start);
	const actionNames = [
		'settings.backup.name',
		'settings.import.name',
		'settings.clear.name',
		'settings.sync.force.name',
		'settings.about.name',
	];

	for (const name of actionNames) {
		const setting = settings.find((item) => item.name === name);
		assert.ok(setting);
		assert.equal(setting.controls[0].classes.has('aulyckanban-settings-action-button'), true);
	}

	const rule = styles.match(/\.aulyckanban-settings-action-button\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(rule, /width:\s*80px/);
	assert.match(rule, /min-width:\s*80px/);
	assert.match(rule, /max-width:\s*80px/);
	assert.match(rule, /justify-content:\s*center/);
	const enabledRule =
		styles.match(/\.aulyckanban-settings-action-button:not\(:disabled\)\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(enabledRule, /cursor:\s*pointer/);
});

test('settings do not expose a project-integrated update checker', () => {
	const { tab } = createHarness();
	const start = renderedSettings.length;
	tab.display();
	const rendered = renderedSettings.slice(start);
	assert.equal(
		rendered.some((item) => item.name?.startsWith('settings.updates')),
		false,
	);
});

test('settings expose one select-only sync folder without layout or per-note controls', async () => {
	const { tab, settings, syncCalls } = createHarness();
	const start = renderedSettings.length;
	tab.display();
	const rendered = renderedSettings.slice(start);

	assert.equal(rendered.filter((item) => item.dropdown).length, 1);
	assert.equal(
		rendered.some((item) => item.name === '工作任务settings.sync.viewPath.suffix'),
		false,
	);
	assert.equal(
		rendered.some((item) => item.name === 'settings.sync.archivePath.name'),
		false,
	);

	const folder = rendered.find((item) => item.name === 'settings.sync.folder.name');
	assert.ok(folder);
	assert.equal(folder.text, undefined);
	assert.equal(folder.dropdown.value, 'X-aulyc看板');
	assert.deepEqual(
		[...folder.dropdown.options.keys()],
		['X-aulyc看板', 'Alpha', 'Beta', '工作', '项目'],
	);
	assert.equal(folder.dropdown.classes.has('aulyckanban-sync-folder-select'), true);
	await folder.dropdown.onChangeHandler('项目');
	assert.equal(settings.syncFolder, '项目');
	assert.equal(syncCalls.all, 1);
});

test('the current folder remains selectable when it is not loaded in the Vault', () => {
	const { tab } = createHarness();
	const start = renderedSettings.length;
	tab.display();
	const rendered = renderedSettings.slice(start);
	const folder = rendered.find((item) => item.name === 'settings.sync.folder.name');

	assert.equal(folder.dropdown.options.get('X-aulyc看板'), 'X-aulyc看板');
});

test('sync folder dropdown lists only top-level Vault folders', () => {
	const { tab } = createHarness();
	const start = renderedSettings.length;
	tab.display();
	const rendered = renderedSettings.slice(start);
	const folder = rendered.find((item) => item.name === 'settings.sync.folder.name');

	assert.deepEqual([...folder.dropdown.options.keys()].slice(1), ['Alpha', 'Beta', '工作', '项目']);
	assert.equal(folder.dropdown.options.has('Alpha/task.md'), false);
});

test('sync folder uses the native dropdown without custom selection chrome', () => {
	const { tab } = createHarness();
	const start = renderedSettings.length;
	tab.display();
	const folder = renderedSettings
		.slice(start)
		.find((item) => item.name === 'settings.sync.folder.name');
	const selectRule = styles.match(/\.aulyckanban-sync-folder-select\s*\{([^}]*)\}/)?.[1] ?? '';

	assert.ok(folder.dropdown);
	assert.equal(folder.text, undefined);
	assert.match(selectRule, /width:\s*248px/);
	assert.match(selectRule, /max-width:\s*100%/);
	assert.doesNotMatch(styles, /aulyckanban-sync-folder-selected-icon/);
	assert.doesNotMatch(styles, /aulyckanban-folder-suggest/);
});

test('force refresh requires confirmation and reports the rebuilt note count', async () => {
	const { tab, syncCalls } = createHarness();
	const settingStart = renderedSettings.length;
	const modalStart = renderedConfirmModals.length;
	const noticeStart = renderedNotices.length;
	tab.display();
	const forceSetting = renderedSettings
		.slice(settingStart)
		.find((item) => item.name === 'settings.sync.force.name');

	assert.ok(forceSetting);
	assert.equal(forceSetting.desc, 'settings.sync.force.desc');
	assert.equal(forceSetting.controls[0].text, 'settings.sync.force.button');
	forceSetting.controls[0].onClickHandler();

	const modal = renderedConfirmModals[modalStart];
	assert.ok(modal);
	assert.equal(modal.opened, true);
	assert.equal(modal.options.message, 'settings.sync.force.confirm');
	assert.equal(modal.options.confirmText, 'settings.sync.force.button');
	modal.options.onConfirm();
	await new Promise((resolve) => setImmediate(resolve));

	assert.equal(syncCalls.force, 1);
	assert.equal(forceSetting.controls[0].disabled, false);
	assert.equal(forceSetting.controls[0].text, 'settings.sync.force.button');
	assert.deepEqual(renderedNotices.slice(noticeStart), ['sync success 3']);
});
