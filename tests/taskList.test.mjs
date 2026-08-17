import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSourceModule } from './helpers/load-source-module.mjs';

class MockElement {
	constructor(options = {}, tagName = 'div') {
		this.tagName = tagName;
		this.children = [];
		this.dataset = {};
		this.attributes = { ...(options.attr ?? {}) };
		this.listeners = new Map();
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
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	createSpan(options = {}) {
		return this.createDiv(options);
	}

	createEl(tagName, options = {}) {
		const child = new MockElement(options, tagName);
		child.parentElement = this;
		this.children.push(child);
		return child;
	}

	addEventListener(name, listener) {
		const listeners = this.listeners.get(name) ?? [];
		listeners.push(listener);
		this.listeners.set(name, listeners);
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
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
let activeMenus = [];
let activeMoveModals = [];
const { TaskList } = await loadSourceModule(new URL('../src/ui/TaskList.ts', import.meta.url), {
	label: 'task-list',
	mocks: {
		obsidian: {
			Menu: class {
				constructor() {
					this.items = [];
					activeMenus.push(this);
				}
				addItem(callback) {
					const item = {
						setTitle(value) {
							this.title = value;
							return this;
						},
						setIcon(value) {
							this.icon = value;
							return this;
						},
						onClick(handler) {
							this.handler = handler;
							return this;
						},
					};
					callback(item);
					this.items.push(item);
					return this;
				}
				showAtMouseEvent(event) {
					this.event = event;
				}
			},
			Notice: class {},
			setIcon: (element, icon) => {
				element.icon = icon;
			},
		},
		'../utils/taskQuery': {
			getTaskRefKey: (ref) => `${ref.viewId}:${ref.columnId}:${ref.task.id}`,
		},
		'./TaskCard': {
			TaskCard: class {
				constructor(parent, _app, _store, viewId, columnId, task, sourceLabel, options) {
					this.el = parent.createDiv({ cls: 'aulyckanban-task' });
					this.el.dataset.viewId = viewId;
					this.el.dataset.columnId = columnId;
					this.el.dataset.taskId = task.id;
					activeCards.push({ viewId, columnId, sourceLabel, options });
				}
				getEl() {
					return this.el;
				}
			},
		},
		'./TaskMoveModal': {
			TaskMoveModal: class {
				constructor(_app, options) {
					this.options = options;
					activeMoveModals.push(this);
				}
				open() {
					this.opened = true;
				}
			},
		},
		'../utils/dom': {
			appendAccessibleLabel: (element, label) => element.createSpan({ text: label }),
		},
		'./InlineInput': { createInlineInput: () => ({}) },
		'../i18n': {
			t: (key) => (key === 'task.select.count' ? '已选 {count} 项' : key),
		},
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
	const tasks = descendants(list.getEl()).find((element) =>
		element.classList.contains('aulyckanban-tasks'),
	);
	assert.equal(tasks.children.length, 2);
});

test('ordinary task list enters multi-select mode and moves the selected coordinates together', () => {
	activeCards = [];
	activeMoveModals = [];
	const actions = [];
	const refs = [
		taskRef('work', '工作任务', 'base', '基础', '工作内容'),
		{
			...taskRef('personal', '个人任务', 'base', '基础', '个人内容'),
			task: { ...taskRef('personal', '个人任务', 'base', '基础', '个人内容').task, id: 'personal' },
		},
	];
	const store = {
		lastActionMutatedData: false,
		getVisibleTaskRefs: () => refs,
		getTaskScope: () => 'all',
		getColumnScope: () => 'current',
		getCurrentView: () => 'personal',
		getActiveColumnId: () => 'base',
		getSearchKeyword: () => '',
		getTaskViews: () => [
			{ id: 'work', title: '工作任务' },
			{ id: 'personal', title: '个人任务' },
		],
		getCurrentColumns: () => [
			{ id: 'base', title: '基础' },
			{ id: 'important', title: '重要' },
		],
		dispatch(action) {
			actions.push(action);
			this.lastActionMutatedData = action.type === 'MOVE_TASKS';
		},
	};
	const parent = new MockElement();
	const footerStatus = new MockElement();
	const list = new TaskList(parent, {}, store);
	list.setStatusEl(footerStatus);
	list.render();
	assert.equal(footerStatus.children.length, 0);
	const selectionButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-select-mode-btn'),
	);
	let cancelButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-cancel-selection-btn'),
	);
	assert.ok(selectionButton);
	assert.equal(selectionButton.icon, 'list-checks');
	assert.equal(cancelButton.disabled, true);
	const cardCountBeforeDisabledCancel = activeCards.length;
	cancelButton.listeners.get('click')[0]();
	assert.equal(activeCards.length, cardCountBeforeDisabledCancel);
	selectionButton.listeners.get('click')[0]();
	assert.equal(footerStatus.children[0].textContent, '已选 0 项');
	assert.equal(
		descendants(parent).some((element) =>
			element.classList.contains('aulyckanban-task-selected-count'),
		),
		false,
	);
	cancelButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-cancel-selection-btn'),
	);
	assert.equal(cancelButton.disabled, false);

	const selectingCards = activeCards.slice(-2);
	assert.equal(
		selectingCards.every((card) => card.options.selectionMode),
		true,
	);
	selectingCards[0].options.onSelectionRequest({ shiftKey: false });
	selectingCards[1].options.onSelectionRequest({ shiftKey: false });
	assert.equal(footerStatus.children[0].textContent, '已选 2 项');
	assert.equal(
		footerStatus.children[0].classList.contains('aulyckanban-board-footer-selection'),
		true,
	);
	const selectedCards = activeCards.slice(-2);
	const transfer = {
		setData(type, value) {
			this.value = [type, value];
		},
	};
	assert.equal(selectedCards[0].options.onDragStart({ dataTransfer: transfer }), 2);
	assert.deepEqual(transfer.value, ['text/plain', 'task.drag.count']);
	selectedCards[0].options.onDragEnd({});

	assert.equal(
		descendants(parent).some((element) =>
			element.classList.contains('aulyckanban-task-move-selected-btn'),
		),
		false,
	);
	selectedCards[0].options.onContextMenu({});
	assert.equal(activeMenus.at(-1).items[0].title, 'task.move.selected');
	activeMenus.at(-1).items[0].handler();
	assert.equal(activeMoveModals.at(-1).options.taskCount, 2);
	activeMoveModals.at(-1).options.onMove({ targetColumnId: 'important' });
	assert.equal(actions.at(-1).type, 'MOVE_TASKS');
	assert.deepEqual(actions.at(-1).payload, {
		tasks: [
			{ viewId: 'work', columnId: 'base', taskId: 'duplicate' },
			{ viewId: 'personal', columnId: 'base', taskId: 'personal' },
		],
		targetViewId: undefined,
		targetColumnId: 'important',
	});
	assert.equal(footerStatus.children.length, 0);
});

test('cancelling selection clears selected cards and the footer status', () => {
	activeCards = [];
	const refs = [taskRef('work', '工作任务', 'base', '基础', '工作内容')];
	const store = {
		getVisibleTaskRefs: () => refs,
		getTaskScope: () => 'current',
		getColumnScope: () => 'current',
		getCurrentView: () => 'work',
		getActiveColumnId: () => 'base',
		getSearchKeyword: () => '',
	};
	const parent = new MockElement();
	const footerStatus = new MockElement();
	const list = new TaskList(parent, {}, store);
	list.setStatusEl(footerStatus);
	list.render();

	const selectionButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-select-mode-btn'),
	);
	selectionButton.listeners.get('click')[0]();
	activeCards.at(-1).options.onSelectionRequest({ shiftKey: false });
	assert.equal(activeCards.at(-1).options.selected, true);
	assert.equal(footerStatus.children[0].textContent, '已选 1 项');

	list.cancelSelection();
	assert.equal(activeCards.at(-1).options.selectionMode, false);
	assert.equal(activeCards.at(-1).options.selected, false);
	assert.equal(footerStatus.children.length, 0);
	const cancelButton = descendants(parent).find((element) =>
		element.classList.contains('aulyckanban-task-cancel-selection-btn'),
	);
	assert.equal(cancelButton.disabled, true);
});

test('right-clicking an ordinary card opens the exact same move modal for that card', () => {
	activeCards = [];
	activeMenus = [];
	activeMoveModals = [];
	const ref = taskRef('work', '工作任务', 'base', '基础', '工作内容');
	const store = {
		getVisibleTaskRefs: () => [ref],
		getTaskScope: () => 'current',
		getColumnScope: () => 'current',
		getCurrentView: () => 'work',
		getActiveColumnId: () => 'base',
		getSearchKeyword: () => '',
		getTaskViews: () => [{ id: 'work', title: '工作任务' }],
		getCurrentColumns: () => [{ id: 'base', title: '基础' }],
	};
	const list = new TaskList(new MockElement(), {}, store);
	list.render();
	activeCards[0].options.onContextMenu({});
	assert.equal(activeMenus.at(-1).items[0].title, 'task.move.menu');
	activeMenus.at(-1).items[0].handler();
	assert.equal(activeMoveModals.at(-1).options.taskCount, 1);
	assert.equal(activeMoveModals.at(-1).options.initialViewId, 'work');
	assert.equal(activeMoveModals.at(-1).options.initialColumnId, 'base');
});

test('dragging a card starts and cancels one shared move session', () => {
	activeCards = [];
	const ref = taskRef('work', '工作任务', 'base', '基础', '工作内容');
	const dragCalls = [];
	const drag = {
		setDropHandler(handler) {
			this.dropHandler = handler;
		},
		start(tasks) {
			dragCalls.push(['start', tasks]);
		},
		cancel() {
			dragCalls.push(['cancel']);
		},
	};
	const store = {
		getVisibleTaskRefs: () => [ref],
		getTaskScope: () => 'current',
		getColumnScope: () => 'current',
		getCurrentView: () => 'work',
		getActiveColumnId: () => 'base',
		getSearchKeyword: () => '',
	};
	const list = new TaskList(new MockElement(), {}, store, drag);
	list.render();
	const transfer = {
		setData(type, value) {
			this.value = [type, value];
		},
	};
	activeCards[0].options.onDragStart({ dataTransfer: transfer });
	activeCards[0].options.onDragEnd({});
	assert.equal(transfer.effectAllowed, 'move');
	assert.deepEqual(transfer.value, ['text/plain', 'task.drag.count']);
	assert.deepEqual(dragCalls, [
		['start', [{ viewId: 'work', columnId: 'base', taskId: 'duplicate' }]],
		['cancel'],
	]);
});

test('dropping a card back on its current target is a quiet no-op', () => {
	const actions = [];
	const drag = {
		setDropHandler(handler) {
			this.dropHandler = handler;
		},
		start() {},
		cancel() {},
	};
	const store = {
		dispatch: (action) => actions.push(action),
	};
	new TaskList(new MockElement(), {}, store, drag);
	drag.dropHandler([{ viewId: 'work', columnId: 'base', taskId: 'duplicate' }], {
		targetColumnId: 'base',
	});
	assert.deepEqual(actions, []);
});

function descendants(element) {
	return element.children.flatMap((child) => [child, ...descendants(child)]);
}
