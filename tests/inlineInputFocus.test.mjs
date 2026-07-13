import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/ui/InlineInput.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES2020,
	},
}).outputText;

test('focusOnMount focuses synchronously without exposing an old focus frame', () => {
	const events = [];
	const input = {
		value: '',
		addEventListener: () => {},
		focus: () => events.push('focus'),
		setSelectionRange: (start, end) => events.push(`selection:${start}:${end}`),
	};
	const parent = { createEl: () => input };
	const module = { exports: {} };
	const context = {
		module,
		exports: module.exports,
		HTMLTextAreaElement: class {},
		requestAnimationFrame: () => events.push('animation-frame'),
		require: (id) => {
			if (id === '../utils/dom') return { autoResizeTextarea: () => {} };
			if (id === '../utils/inlineCommit') return { createInlineCommitController: () => null };
			if (id === '../utils/keyboard') return { shouldCommitInlineInput: () => false };
			throw new Error(`Unexpected import: ${id}`);
		},
	};
	vm.runInNewContext(output, context);

	context.module.exports.createInlineInput(parent, {
		cls: 'test-input',
		persistent: true,
		focusOnMount: true,
		onCommit: () => {},
	});

	assert.deepEqual(events, ['focus', 'selection:0:0']);
});
