import assert from 'node:assert/strict';
import test from 'node:test';
import inlineCommitModule from '../src/utils/inlineCommit.ts';
import keyboardModule from '../src/utils/keyboard.ts';

const { createInlineCommitController } = inlineCommitModule;
const { shouldCommitInlineInput } = keyboardModule;

test('normal Enter commits an inline input', () => {
	assert.equal(shouldCommitInlineInput({ key: 'Enter', isComposing: false }, false), true);
});

test('Enter does not commit while local composition state is active', () => {
	assert.equal(shouldCommitInlineInput({ key: 'Enter', isComposing: false }, true), false);
});

test('Enter does not commit while the keyboard event is composing', () => {
	assert.equal(shouldCommitInlineInput({ key: 'Enter', isComposing: true }, false), false);
});

test('non-Enter keys do not commit', () => {
	assert.equal(shouldCommitInlineInput({ key: 'Escape', isComposing: false }, false), false);
});

test('an inline commit controller can only commit once', () => {
	let commits = 0;
	let cancels = 0;
	const controller = createInlineCommitController(
		() => commits++,
		() => cancels++,
	);

	controller.commit();
	controller.commit();
	controller.cancel();

	assert.equal(commits, 1);
	assert.equal(cancels, 0);
});

test('a rejected commit keeps the controller alive for a later commit', () => {
	let attempts = 0;
	let cancels = 0;
	const controller = createInlineCommitController(
		() => {
			attempts += 1;
			if (attempts === 1) return false;
			return true;
		},
		() => cancels++,
	);

	controller.commit(); // 内容为空被拒绝，编辑态保持
	controller.commit(); // 第二次提交成功
	controller.commit(); // 已结束，忽略
	controller.cancel();

	assert.equal(attempts, 2);
	assert.equal(cancels, 0);
});

test('a synchronous blur cancel cannot interrupt an accepted commit', () => {
	let commits = 0;
	let cancels = 0;
	let controller;
	controller = createInlineCommitController(
		() => {
			commits += 1;
			// 提交回调可能同步重渲染并移除输入框，进而触发 blur/cancel。
			controller.cancel();
			return true;
		},
		() => cancels++,
	);

	controller.commit();
	controller.commit();

	assert.equal(commits, 1);
	assert.equal(cancels, 0);
});

test('cancelling prevents a later commit', () => {
	let commits = 0;
	let cancels = 0;
	const controller = createInlineCommitController(
		() => commits++,
		() => cancels++,
	);

	controller.cancel();
	controller.commit();

	assert.equal(commits, 0);
	assert.equal(cancels, 1);
});
