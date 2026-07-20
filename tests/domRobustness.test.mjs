import assert from 'node:assert/strict';
import test from 'node:test';
import domModule from '../src/utils/dom.ts';

const { setTextWithLineBreaks } = domModule;

test('line-break rendering tolerates legacy missing content as a final defense', async () => {
	const appended = [];
	const element = {
		appendText(value) {
			appended.push(value);
		},
		createEl(tag) {
			appended.push(`<${tag}>`);
		},
	};

	assert.doesNotThrow(() => setTextWithLineBreaks(element, undefined));
	assert.deepEqual(appended, ['']);
});
