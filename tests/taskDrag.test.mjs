import assert from 'node:assert/strict';
import test from 'node:test';
import dragModule from '../src/ui/TaskDrag.ts';

const { TaskDrag } = dragModule;

const tasks = [
	{ viewId: 'work', columnId: 'base', taskId: 'a' },
	{ viewId: 'personal', columnId: 'base', taskId: 'b' },
];

test('dragging directly to one target changes only that dimension', () => {
	const drops = [];
	const drag = new TaskDrag((selected, target) => drops.push({ selected, target }));
	drag.start(tasks);
	drag.drop({ targetColumnId: 'important' });

	assert.deepEqual(drops, [{ selected: tasks, target: { targetColumnId: 'important' } }]);
	assert.equal(drag.isDragging, false);
});

test('locking a task type before dropping on a quadrant creates one combined move', () => {
	const drops = [];
	const drag = new TaskDrag((selected, target) => drops.push({ selected, target }));
	drag.start(tasks);
	drag.lockView('personal');
	drag.drop({ targetColumnId: 'important' });

	assert.deepEqual(drops, [
		{
			selected: tasks,
			target: { targetViewId: 'personal', targetColumnId: 'important' },
		},
	]);
});

test('cancelling a drag clears sticky targets without mutating tasks', () => {
	const drops = [];
	const drag = new TaskDrag((selected, target) => drops.push({ selected, target }));
	drag.start(tasks);
	drag.lockView('personal');
	drag.cancel();

	assert.equal(drag.isDragging, false);
	assert.equal(drag.lockedViewId, null);
	assert.deepEqual(drops, []);
});
