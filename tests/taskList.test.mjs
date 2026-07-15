import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

class MockElement {
	constructor(options = {}) {
		this.children = [];
		this.dataset = {};
		this.classes = new Set(
			String(options.cls ?? '')
				.split(/\s+/)
				.filter(Boolean),
		);
		this.textContent = options.text ?? '';
		this.scrollTop = 0;
		this.classList = { contains: (value) => this.classes.has(value) };
	}

	createDiv(options = {}) {
		const child = new MockElement(options);
		this.children.push(child);
		return child;
	}

	empty() {
		this.children = [];
	}

	appendChild(child) {
		this.children.push(child);
		return child;
	}

	querySelector() {
		return null;
	}
}

const source = readFileSync(new URL('../src/ui/TaskList.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function taskRef(viewId, viewTitle, columnId, columnTitle, content) {
	return {
		viewId,
		viewTitle,
		columnId,
		columnTitle,
		task: { id: 'duplicate', content, completed: false, createdAt: '2026-01-01T00:00:00Z' },
	};
}

test('aggregate list renders duplicate task ids with their explicit source labels', () => {
	const cards = [];
	const module = { exports: {} };
	vm.runInNewContext(output, {
		module,
		exports: module.exports,
		document: { activeElement: null },
		require: (id) => {
			if (id === '../utils/taskQuery') {
				return { getTaskRefKey: (ref) => `${ref.viewId}:${ref.columnId}:${ref.task.id}` };
			}
			if (id === './TaskCard') {
				return {
					TaskCard: class {
						constructor(_app, _store, viewId, columnId, task, sourceLabel) {
							this.el = new MockElement({ cls: 'aulyckanban-task' });
							this.el.dataset.viewId = viewId;
							this.el.dataset.columnId = columnId;
							this.el.dataset.taskId = task.id;
							cards.push({ viewId, columnId, sourceLabel });
						}
						getEl() {
							return this.el;
						}
					},
				};
			}
			if (id === './InlineInput') return { createInlineInput: () => ({}) };
			if (id === '../i18n') return { t: (key) => key };
			throw new Error(`Unexpected import: ${id}`);
		},
	});

	const refs = [
		taskRef('work', '工作任务', 'base', '基础', '工作内容'),
		taskRef('personal', '个人任务', 'base', '基础', '个人内容'),
	];
	const store = {
		getVisibleTaskRefs: () => refs,
		getTaskScope: () => 'all',
		getColumnScope: () => 'current',
		getCurrentView: () => 'personal',
		getActiveColumnId: () => 'base',
		getSearchKeyword: () => '',
	};
	const parent = new MockElement();
	const list = new module.exports.TaskList(parent, {}, store);
	list.render();
	list.render();

	assert.equal(cards.length, 2);
	assert.equal(JSON.stringify(cards.map((card) => card.sourceLabel)), '["工作任务","个人任务"]');
	assert.equal(list.getEl().children[0].children.length, 2);
});
