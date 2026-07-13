import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function rule(selector) {
	const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

test('task types and quadrants use a one-pixel selection border', () => {
	assert.match(
		rule('.aulyckanban-tab.aulyckanban-tab-active'),
		/border-color:\s*var\(--aulyckanban-selection-border\)/,
	);
	assert.match(
		rule('.aulyckanban-nav-item'),
		/border:\s*1px solid transparent/,
	);
	assert.match(
		rule('.aulyckanban-nav-item-active'),
		/border-color:\s*var\(--aulyckanban-selection-border\)/,
	);
});

test('task selection is white and task editing is one-pixel accent', () => {
	assert.match(
		rule('.aulyckanban-task:focus'),
		/border-color:\s*var\(--aulyckanban-selection-border\)/,
	);
	assert.match(rule('.aulyckanban-task'), /border:\s*1px solid/);
	assert.match(
		css,
		/\.aulyckanban-task\.aulyckanban-task-editing[\s\S]*?border-color:\s*var\(--interactive-accent\)/,
	);
});

test('task type and quadrant editors use only a one-pixel accent border', () => {
	for (const selector of [
		'.aulyckanban-kanban-container .aulyckanban-view-inline-input',
		'.aulyckanban-kanban-container .aulyckanban-nav-inline-input',
	]) {
		const declarations = rule(selector);
		assert.match(declarations, /border:\s*1px solid var\(--interactive-accent\)/);
		assert.match(declarations, /box-shadow:\s*none/);
	}
});

test('task type editing explicitly clears the previously selected task type', () => {
	assert.match(
		css,
		/\.aulyckanban-toolbar-editing\s+\.aulyckanban-view-tab\.aulyckanban-tab-active/,
	);
});

test('task type buttons use one normalized border without theme button shadows', () => {
	const tabRule = rule('.aulyckanban-tab');
	assert.match(tabRule, /border:\s*1px solid/);
	assert.match(tabRule, /box-shadow:\s*none\s*!important/);
	assert.match(tabRule, /appearance:\s*none/);

	const suppressedActiveRule = css.match(
		/\.aulyckanban-toolbar-editing[\s\S]*?\.aulyckanban-view-tab\.aulyckanban-tab-active\s*\{([^}]*)\}/,
	)?.[1] ?? '';
	assert.notEqual(suppressedActiveRule, '');
	assert.match(suppressedActiveRule, /box-shadow:\s*none\s*!important/);
});

test('task type add focus is exactly one white border', () => {
	const focusRule = css.match(
		/\.aulyckanban-view-add-btn:focus,\s*\.aulyckanban-view-add-btn:focus-visible\s*\{([^}]*)\}/,
	)?.[1] ?? '';
	assert.notEqual(focusRule, '');
	assert.match(
		focusRule,
		/border:\s*1px solid var\(--aulyckanban-selection-border\)\s*!important/,
	);
	assert.match(focusRule, /outline:\s*none\s*!important/);
	assert.match(focusRule, /box-shadow:\s*none\s*!important/);
});
