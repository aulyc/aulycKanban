import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const renderedSettings = [];

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
				addEventListener: (name, listener) => listeners.set(name, listener),
			},
			listeners,
			setPlaceholder: (value) => {
				text.placeholder = value;
				return text;
			},
			setValue: (value) => {
				text.value = value;
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
	const app = { containerEl: new MockElement() };
	const context = {
		module,
		exports: module.exports,
		require: (id) => {
			if (id === 'obsidian') {
				return {
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
