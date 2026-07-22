import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

const renderedSettings = [];
const renderedFolderSuggests = [];
const renderedConfirmModals = [];
const renderedAboutModals = [];
const renderedNotices = [];
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

class MockAbstractInputSuggest {
	constructor(app, inputEl) {
		this.app = app;
		this.inputEl = inputEl;
		this.suggestClasses = new Set();
		this.suggestStyles = new Map();
		this.suggestEl = {
			classList: { add: (value) => this.suggestClasses.add(value) },
			style: { setProperty: (name, value) => this.suggestStyles.set(name, value) },
		};
		inputEl.addEventListener('input', () => {
			this.lastSuggestions = this.getSuggestions(inputEl.value);
		});
		renderedFolderSuggests.push(this);
	}
	open() {
		this.opened = true;
	}
	setValue(value) {
		this.inputEl.value = value;
	}
	close() {
		this.closed = true;
	}
}

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
		const dropdown = {
			options: new Map(),
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
					createEvent: () => ({
						initEvent(type) {
							this.type = type;
						},
					}),
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
				AbstractInputSuggest: MockAbstractInputSuggest,
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
			getAllFolders: () => [
				{ path: 'Alpha' },
				{ path: 'Beta' },
				{ path: '工作' },
				{ path: '项目' },
				{ path: '项目/a计划' },
			],
		},
	};
	const tab = new KanbanSettingTab(app, plugin);
	return { tab, settings, syncCalls };
}

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

test('settings expose one automatic sync folder without layout or per-note controls', async () => {
	const { tab, settings, syncCalls } = createHarness();
	const start = renderedSettings.length;
	tab.display();
	const rendered = renderedSettings.slice(start);

	assert.equal(
		rendered.some((item) => item.dropdown),
		false,
	);
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
	assert.equal(folder.text.value, 'X-aulyc看板');
	await folder.text.onChangeHandler(' 新目录/任务同步/ ');
	assert.equal(settings.syncFolder, '新目录/任务同步');
	assert.equal(syncCalls.all, 0);
	folder.text.listeners.get('change')();
	assert.equal(syncCalls.all, 1);
});

test('clearing the folder restores the default managed directory', async () => {
	const { tab, settings } = createHarness();
	const start = renderedSettings.length;
	tab.display();
	const rendered = renderedSettings.slice(start);
	const folder = rendered.find((item) => item.name === 'settings.sync.folder.name');

	await folder.text.onChangeHandler('   ');
	assert.equal(settings.syncFolder, 'X-aulyc看板');
});

test('sync folder input lists only top-level vault folders and filters Chinese or Latin input', () => {
	const { tab } = createHarness();
	const start = renderedSettings.length;
	const suggestStart = renderedFolderSuggests.length;
	tab.display();
	const rendered = renderedSettings.slice(start);
	const folder = rendered.find((item) => item.name === 'settings.sync.folder.name');
	const suggest = renderedFolderSuggests[suggestStart];

	folder.text.listeners.get('focus')();
	assert.deepEqual(new Set(suggest.lastSuggestions), new Set(['Alpha', 'Beta', '工作', '项目']));

	folder.text.inputEl.value = 'a';
	folder.text.inputEl.dispatchEvent({ type: 'input' });
	assert.deepEqual(new Set(suggest.lastSuggestions), new Set(['Alpha', 'Beta']));

	folder.text.inputEl.value = '项';
	folder.text.inputEl.dispatchEvent({ type: 'input' });
	assert.deepEqual(suggest.lastSuggestions, ['项目']);
});

test('choosing a suggested vault folder persists it and schedules note synchronization', () => {
	const { tab, settings, syncCalls } = createHarness();
	const start = renderedSettings.length;
	const suggestStart = renderedFolderSuggests.length;
	tab.display();
	const rendered = renderedSettings.slice(start);
	const folder = rendered.find((item) => item.name === 'settings.sync.folder.name');
	const suggest = renderedFolderSuggests[suggestStart];

	suggest.selectSuggestion('项目');
	assert.equal(folder.text.inputEl.value, '项目');
	assert.equal(settings.syncFolder, '项目');
	assert.equal(syncCalls.all, 1);
});

test('sync folder suggestion popover matches the input width', () => {
	const { tab } = createHarness();
	const suggestStart = renderedFolderSuggests.length;
	tab.display();
	const suggest = renderedFolderSuggests[suggestStart];

	suggest.open();

	assert.equal(suggest.opened, true);
	assert.equal(suggest.suggestClasses.has('aulyckanban-folder-suggest'), true);
	assert.equal(suggest.suggestStyles.get('--aulyckanban-folder-suggest-width'), '248px');
	const rule =
		styles.match(/\.suggestion-container\.aulyckanban-folder-suggest\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(rule, /width:\s*var\(--aulyckanban-folder-suggest-width\) !important/);
	assert.match(rule, /min-width:\s*var\(--aulyckanban-folder-suggest-width\) !important/);
	assert.match(rule, /max-width:\s*var\(--aulyckanban-folder-suggest-width\) !important/);
});

test('sync folder focus adds one pixel inside without an outward focus ring', () => {
	const { tab } = createHarness();
	const start = renderedSettings.length;
	tab.display();
	const folder = renderedSettings
		.slice(start)
		.find((item) => item.name === 'settings.sync.folder.name');
	const focusRule = styles.match(/\.aulyckanban-sync-folder-input:focus\s*\{([^}]*)\}/)?.[1] ?? '';

	assert.equal(folder.text.classes.has('aulyckanban-sync-folder-input'), true);
	assert.match(focusRule, /border-color:\s*var\(--background-modifier-border-focus\)/);
	assert.match(
		focusRule,
		/box-shadow:\s*inset 0 0 0 1px var\(--background-modifier-border-focus\) !important/,
	);
	assert.match(focusRule, /outline:\s*none/);
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
