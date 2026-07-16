import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const renderedSettings = [];
const renderedFolderSuggests = [];

class MockAbstractInputSuggest {
	constructor(app, inputEl) {
		this.app = app;
		this.inputEl = inputEl;
		inputEl.addEventListener('input', () => {
			this.lastSuggestions = this.getSuggestions(inputEl.value);
		});
		renderedFolderSuggests.push(this);
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
		const button = {
			setButtonText: () => button,
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
		const text = {
			inputEl: {
				value: '',
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

const source = readFileSync(new URL('../src/ui/KanbanSettingTab.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function createHarness() {
	const module = { exports: {} };
	const settings = {
		syncFolder: 'X-aulyc看板',
		viewSyncTargets: { work: { filePath: '旧/工作.md' } },
		archive: { filePath: '旧/归档.md' },
	};
	const syncCalls = { all: 0 };
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
		store,
		syncService: {
			scheduleSyncAllViews: () => {
				syncCalls.all += 1;
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
	const context = {
		module,
		exports: module.exports,
		require: (id) => {
			if (id === 'obsidian') {
				return {
					AbstractInputSuggest: MockAbstractInputSuggest,
					Notice: class {},
					normalizePath: (value) => value,
					PluginSettingTab: MockPluginSettingTab,
					Setting: MockSetting,
				};
			}
			if (id === '../i18n') return { t: (key) => key };
			if (id === '../services/backupService') return { BackupService: class {} };
			if (id === '../utils/noteSync')
				return {
					normalizeSyncFolder: (value) => {
						const folder = value
							.trim()
							.replace(/\/{2,}/g, '/')
							.replace(/^\/+|\/+$/g, '');
						return folder || 'X-aulyc看板';
					},
				};
			if (id === './ClearDataModal' || id === './ConfirmModal')
				return { ClearDataModal: class {}, ConfirmModal: class {} };
			throw new Error(`Unexpected import: ${id}`);
		},
	};
	vm.runInNewContext(output, context);
	const tab = new context.module.exports.KanbanSettingTab(app, plugin);
	return { tab, settings, syncCalls };
}

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
