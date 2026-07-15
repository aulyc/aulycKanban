import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/utils/resizeHost.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(output, { module, exports: module.exports });

const { findResizeHost, updateResizeHost, clearResizeHost } = module.exports;

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

test('desktop resize host is fixed to exactly 600px', () => {
	const rule =
		styles.match(/body:not\(\.is-mobile\) \.aulyckanban-resize-host\s*\{([^}]*)\}/)?.[1] ?? '';
	assert.match(rule, /flex:\s*0 0 600px !important/);
	assert.match(rule, /width:\s*600px !important/);
	assert.match(rule, /min-width:\s*600px !important/);
	assert.match(rule, /max-width:\s*600px !important/);
});
