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
		syncMode: 'aggregate',
		aggregate: { filePath: '' },
		viewSyncTargets: { work: { filePath: '旧/工作.md' } },
		archive: { filePath: '旧/归档.md' },
	};
	const syncCalls = { all: 0, view: [], archive: 0 };
	const store = {
		getSettings: () => settings,
		getTaskViews: () => [{ id: 'work', title: '工作任务' }],
		dispatch(action) {
			if (action.type !== 'UPDATE_SETTINGS') return;
			if (action.payload.syncMode) settings.syncMode = action.payload.syncMode;
			if (action.payload.aggregate)
				settings.aggregate = { ...settings.aggregate, ...action.payload.aggregate };
			if (action.payload.viewSyncTargets) {
				for (const [id, target] of Object.entries(action.payload.viewSyncTargets))
					settings.viewSyncTargets[id] = {
						...settings.viewSyncTargets[id],
						...target,
					};
			}
			if (action.payload.archive)
				settings.archive = { ...settings.archive, ...action.payload.archive };
		},
		async saveNow() {},
	};
	const plugin = {
		store,
		syncService: {
			scheduleSyncAllViews: () => {
				syncCalls.all += 1;
			},
			scheduleSyncView: (id) => syncCalls.view.push(id),
			scheduleSyncArchive: () => {
				syncCalls.archive += 1;
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
			if (id === './ClearDataModal' || id === './ConfirmModal')
				return { ClearDataModal: class {}, ConfirmModal: class {} };
			if (id === './FileSuggest')
				return {
					FileSuggest: class {
						close() {}
					},
				};
			throw new Error(`Unexpected import: ${id}`);
		},
	};
	vm.runInNewContext(output, context);
	const tab = new context.module.exports.KanbanSettingTab(app, plugin);
	return { tab, settings, syncCalls };
}

test('aggregate mode shows one path and schedules creation after it is saved', async () => {
	const { tab, settings, syncCalls } = createHarness();
	const start = renderedSettings.length;
	tab.display();
	const rendered = renderedSettings.slice(start);

	const mode = rendered.find((item) => item.name === 'settings.sync.mode.name');
	assert.equal(mode.dropdown.value, 'aggregate');
	assert.equal(mode.dropdown.options.get('aggregate'), 'settings.sync.mode.aggregate');
	assert.equal(mode.dropdown.options.get('per-view'), 'settings.sync.mode.perView');

	const aggregate = rendered.find((item) => item.name === 'settings.sync.aggregatePath.name');
	assert.ok(aggregate);
	assert.equal(
		rendered.some((item) => item.name === '工作任务settings.sync.viewPath.suffix'),
		false,
	);
	await aggregate.text.onChangeHandler(' 看板/全部任务.md ');
	assert.equal(settings.aggregate.filePath, '看板/全部任务.md');
	assert.equal(syncCalls.all, 0);
	aggregate.text.listeners.get('change')();
	assert.equal(syncCalls.all, 1);
});

test('switching to compatible mode restores per-task-type and archive path controls', async () => {
	const { tab, settings, syncCalls } = createHarness();
	const start = renderedSettings.length;
	tab.display();
	const firstRender = renderedSettings.slice(start);
	const mode = firstRender.find((item) => item.name === 'settings.sync.mode.name');
	const secondStart = renderedSettings.length;

	await mode.dropdown.onChangeHandler('per-view');
	const secondRender = renderedSettings.slice(secondStart);

	assert.equal(settings.syncMode, 'per-view');
	assert.equal(
		secondRender.some((item) => item.name === '工作任务settings.sync.viewPath.suffix'),
		true,
	);
	assert.equal(
		secondRender.some((item) => item.name === 'settings.sync.archivePath.name'),
		true,
	);
	assert.equal(syncCalls.all, 1);
});
