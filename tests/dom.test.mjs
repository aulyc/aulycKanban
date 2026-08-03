import assert from 'node:assert/strict';
import test from 'node:test';
import domModule from '../src/utils/dom.ts';

const { autoResizeTextarea, getTextareaBorderBoxHeight } = domModule;

test('textarea border-box height includes both borders', () => {
	assert.equal(getTextareaBorderBoxHeight(37, '1px', '1px'), 39);
});

test('textarea border-box height supports fractional and missing border widths', () => {
	assert.equal(getTextareaBorderBoxHeight(37, '0.5px', ''), 37.5);
});

test('textarea grows from one content line when input wraps onto more lines', () => {
	const listeners = new Map();
	const textarea = {
		style: { height: '' },
		setCssStyles(styles) {
			Object.assign(this.style, styles);
		},
		scrollHeight: 36,
		computedStyle: { borderTopWidth: '1px', borderBottomWidth: '1px' },
		win: {
			requestAnimationFrame: (callback) => callback(),
			getComputedStyle: (element) => element.computedStyle,
		},
		addEventListener(name, listener) {
			listeners.set(name, listener);
		},
		removeEventListener(name, listener) {
			if (listeners.get(name) === listener) listeners.delete(name);
		},
	};

	const cleanup = autoResizeTextarea(textarea);
	assert.equal(textarea.style.height, '38px');

	textarea.scrollHeight = 55;
	listeners.get('input')();
	assert.equal(textarea.style.height, '57px');

	cleanup();
	assert.equal(listeners.has('input'), false);
});
