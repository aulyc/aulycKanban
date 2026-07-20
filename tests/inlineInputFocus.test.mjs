import assert from 'node:assert/strict';
import test from 'node:test';
import inlineInputModule from '../src/ui/InlineInput.ts';

const { createInlineInput } = inlineInputModule;

test('focusOnMount focuses synchronously without exposing an old focus frame', () => {
	const events = [];
	const input = {
		value: '',
		addEventListener: () => {},
		focus: () => events.push('focus'),
		setSelectionRange: (start, end) => events.push(`selection:${start}:${end}`),
	};
	const parent = { createEl: () => input };
	globalThis.HTMLTextAreaElement = class {};

	createInlineInput(parent, {
		cls: 'test-input',
		persistent: true,
		focusOnMount: true,
		onCommit: () => {},
	});

	assert.deepEqual(events, ['focus', 'selection:0:0']);
});
