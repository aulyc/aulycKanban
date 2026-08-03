import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

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

let activeCards = [];
const { TaskList } = await loadSourceModule(new URL('../src/ui/TaskList.ts', import.meta.url), {
	label: 'task-list',
	mocks: {
		'../utils/taskQuery': {
			getTaskRefKey: (ref) => `${ref.viewId}:${ref.columnId}:${ref.task.id}`,
		},
		'./TaskCard': {
			TaskCard: class {
				constructor(parent, _app, _store, viewId, columnId, task, sourceLabel) {
					this.el = parent.createDiv({ cls: 'aulyckanban-task' });
					this.el.dataset.viewId = viewId;
					this.el.dataset.columnId = columnId;
					this.el.dataset.taskId = task.id;
					activeCards.push({ viewId, columnId, sourceLabel });
				}
				getEl() {
					return this.el;
				}
			},
		},
		'./InlineInput': { createInlineInput: () => ({}) },
		'../i18n': { t: (key) => key },
	},
});

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
	activeCards = cards;
	globalThis.document = { activeElement: null };

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
	const list = new TaskList(parent, {}, store);
	list.render();
	list.render();

	assert.equal(cards.length, 2);
	assert.equal(JSON.stringify(cards.map((card) => card.sourceLabel)), '["工作任务","个人任务"]');
	assert.equal(list.getEl().children[0].children.length, 2);
});
