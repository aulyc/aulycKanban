import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadTypeScriptModule(relativePath) {
	const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
	const output = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2020,
		},
	}).outputText;
	const module = { exports: {} };
	vm.runInNewContext(output, { module, exports: module.exports });
	return module.exports;
}

const { shouldCommitInlineInput } = loadTypeScriptModule('../src/utils/keyboard.ts');
const { createInlineCommitController } = loadTypeScriptModule('../src/utils/inlineCommit.ts');

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

test('Enter, confirmation click, and blur can only commit once', () => {
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
