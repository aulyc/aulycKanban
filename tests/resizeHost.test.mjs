import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import resizeHostModule from '../src/utils/resizeHost.ts';

const { clearResizeHost, findResizeHost, updateResizeHost } = resizeHostModule;

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function element(name) {
	const classes = new Set();
	return {
		name,
		classList: {
			add: (value) => classes.add(value),
			remove: (value) => classes.delete(value),
			contains: (value) => classes.has(value),
		},
	};
}

test('right sidedock is preferred over inner workspace tabs as resize host', () => {
	const sideDock = element('sideDock');
	const tabs = element('tabs');
	const container = {
		closest: (selector) => (selector.includes('mod-sidedock') ? sideDock : tabs),
	};
	assert.equal(findResizeHost(container), sideDock);
});

test('main workspace uses workspace tabs and moves the marker between hosts', () => {
	const oldHost = element('old');
	const tabs = element('tabs');
	oldHost.classList.add('aulyckanban-resize-host');
	const container = {
		closest: (selector) => (selector.includes('mod-sidedock') ? null : tabs),
	};

	const nextHost = updateResizeHost(oldHost, container);
	assert.equal(nextHost, tabs);
	assert.equal(oldHost.classList.contains('aulyckanban-resize-host'), false);
	assert.equal(tabs.classList.contains('aulyckanban-resize-host'), true);

	clearResizeHost(nextHost);
	assert.equal(tabs.classList.contains('aulyckanban-resize-host'), false);
});

test('desktop resize host remains draggable with a 450px minimum width', () => {
	const rule =
		styles.match(/body:not\(\.is-mobile\) \.aulyckanban-resize-host\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(rule, /min-width:\s*450px !important/);
	assert.doesNotMatch(rule, /(?:^|[;\s])flex\s*:/);
	assert.doesNotMatch(rule, /(?:^|[;\s])width\s*:/);
	assert.doesNotMatch(rule, /(?:^|[;\s])max-width\s*:/);
});
