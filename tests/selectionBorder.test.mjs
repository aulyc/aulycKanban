import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectorPattern(selector) {
	return selector.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
}

function rule(selector) {
	return css.match(new RegExp(`${selectorPattern(selector)}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

function combinedRule(selectors) {
	const selectorsPattern = selectors.map(selectorPattern).join('\\s*,\\s*');
	return css.match(new RegExp(`${selectorsPattern}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

test('business selection keeps its fill but never owns the white focus border', () => {
	for (const selector of [
		'.aulyckanban-tab.aulyckanban-tab-active',
		'.aulyckanban-nav-item-active',
	]) {
		const declarations = rule(selector);
		assert.match(declarations, /background:\s*var\(--interactive-accent\)/);
		assert.match(declarations, /border-color:\s*transparent/);
		assert.doesNotMatch(declarations, /aulyckanban-selection-border/);
	}
});

test('each of the three keyboard zones draws white only from actual focus', () => {
	const focusRules = [
		combinedRule(['.aulyckanban-tab:focus', '.aulyckanban-tab:focus-visible']),
		combinedRule(['.aulyckanban-nav-item:focus', '.aulyckanban-nav-item:focus-visible']),
		rule('.aulyckanban-task:focus'),
		rule('.aulyckanban-kanban-container .aulyckanban-task-search-input:focus'),
	];
	for (const declarations of focusRules) {
		assert.notEqual(declarations, '');
		assert.match(declarations, /var\(--aulyckanban-selection-border\)/);
	}
});

test('keyboard navigation targets update instantly without visual trails', () => {
	for (const selector of [
		'.aulyckanban-tab',
		'.aulyckanban-nav-item',
		'.aulyckanban-nav-add-btn',
		'.aulyckanban-task',
		'.aulyckanban-task-add-btn',
	]) {
		const declarations = rule(selector);
		assert.match(declarations, /transition:\s*none/);
		assert.doesNotMatch(declarations, /transition:\s*all/);
	}

	assert.match(rule('.aulyckanban-task:focus'), /box-shadow:\s*none/);
});

test('archive control has no separator and keeps selection separate from focus', () => {
	const slot = rule('.aulyckanban-archive-slot');
	assert.match(slot, /padding-left:\s*0/);
	assert.match(slot, /border-left:\s*0/);

	const button = rule('.aulyckanban-kanban-container .aulyckanban-tab.aulyckanban-archive-btn');
	assert.match(button, /background:\s*color-mix\([^;]*var\(--color-orange\)/);
	assert.match(button, /border-color:\s*color-mix\([^;]*var\(--color-orange\)/);
	assert.match(button, /color:\s*var\(--color-orange\)/);

	const active = rule(
		'.aulyckanban-kanban-container ' +
			'.aulyckanban-tab.aulyckanban-archive-btn.aulyckanban-tab-active',
	);
	assert.match(active, /background:\s*color-mix\([^;]*var\(--color-orange\)/);
	assert.match(active, /border-color:\s*transparent/);
	assert.doesNotMatch(active, /border-color:\s*var\(--color-orange\)/);
});

test('all tasks icon keeps a visible content box inside the compact button', () => {
	const button = rule('.aulyckanban-kanban-container .aulyckanban-tab.aulyckanban-all-tasks-btn');
	assert.match(button, /width:\s*30px/);
	assert.match(button, /padding:\s*6px/);

	const icon = rule('.aulyckanban-all-tasks-btn svg');
	assert.match(icon, /flex:\s*none/);
	assert.match(icon, /width:\s*16px/);
});

test('task type add glyph is optically centered', () => {
	const addButton = rule('.aulyckanban-view-add-btn');
	assert.match(addButton, /display:\s*grid/);
	assert.match(addButton, /place-items:\s*center/);
	assert.match(addButton, /line-height:\s*1/);
	assert.match(addButton, /text-align:\s*center/);
});

test('add focus demotes active archive to its inactive semantic color', () => {
	const declarations = combinedRule([
		'.aulyckanban-toolbar:has(.aulyckanban-view-add-btn:focus) ' +
			'.aulyckanban-tab.aulyckanban-archive-btn.aulyckanban-tab-active',
		'.aulyckanban-toolbar:has(.aulyckanban-view-add-btn:focus-visible) ' +
			'.aulyckanban-tab.aulyckanban-archive-btn.aulyckanban-tab-active',
		'.aulyckanban-toolbar:has(.aulyckanban-view-inline-input:focus) ' +
			'.aulyckanban-tab.aulyckanban-archive-btn.aulyckanban-tab-active',
	]);

	assert.match(declarations, /background:\s*color-mix\([^;]*var\(--color-orange\) 16%/);
	assert.match(declarations, /border-color:\s*color-mix\([^;]*var\(--color-orange\) 38%/);
	assert.match(declarations, /color:\s*var\(--color-orange\)/);
});

test('add buttons and editors use their own real focus for the white border', () => {
	for (const selectors of [
		['.aulyckanban-nav-add-btn:focus', '.aulyckanban-nav-add-btn:focus-visible'],
		['.aulyckanban-view-add-btn:focus', '.aulyckanban-view-add-btn:focus-visible'],
		['.aulyckanban-task-add-btn:focus', '.aulyckanban-task-add-btn:focus-visible'],
	]) {
		assert.notEqual(combinedRule(selectors), '');
	}

	for (const selector of [
		'.aulyckanban-kanban-container .aulyckanban-view-inline-input:focus',
		'.aulyckanban-kanban-container .aulyckanban-nav-inline-input:focus',
		'.aulyckanban-kanban-container .aulyckanban-task-search-input:focus',
		'.aulyckanban-task-search-tag:focus',
		'.aulyckanban-kanban-container .aulyckanban-task-create-target:focus',
		'.aulyckanban-kanban-container .aulyckanban-task-create-input:focus',
	]) {
		assert.match(rule(selector), /var\(--aulyckanban-selection-border\)/);
	}
});

test('task type add focus owns the only purple selection in the toolbar', () => {
	const suppressionRule =
		css.match(
			/\.aulyckanban-toolbar:has\(\.aulyckanban-view-add-btn:focus\)\s+\.aulyckanban-tab\.aulyckanban-tab-active,[\s\S]*?\.aulyckanban-toolbar:has\(\.aulyckanban-view-inline-input:focus\)\s+\.aulyckanban-tab\.aulyckanban-tab-active\s*\{([^}]*)\}/,
		)?.[1] ?? '';

	assert.notEqual(suppressionRule, '');
	assert.match(suppressionRule, /background:\s*var\(--interactive-normal\)/);
	assert.match(suppressionRule, /color:\s*var\(--text-normal\)/);
	assert.match(suppressionRule, /border-color:\s*var\(--background-modifier-border\)/);
});

test('quadrant add focus owns the only purple selection in category navigation', () => {
	const suppressionRule =
		css.match(
			/\.aulyckanban-category-nav:has\(\.aulyckanban-nav-add-btn:focus\)\s+\.aulyckanban-nav-item-active,[\s\S]*?\.aulyckanban-category-nav:has\(\.aulyckanban-nav-inline-input:focus\)\s+\.aulyckanban-nav-item-active\s*\{([^}]*)\}/,
		)?.[1] ?? '';

	assert.notEqual(suppressionRule, '');
	assert.match(suppressionRule, /background:\s*transparent/);
	assert.match(suppressionRule, /color:\s*var\(--text-normal\)/);
	assert.match(suppressionRule, /border-color:\s*transparent/);
});

test('every white selection border reference belongs to a focus selector', () => {
	const rules = [
		...css.matchAll(/([^{}]+)\{([^{}]*var\(--aulyckanban-selection-border\)[^{}]*)\}/g),
	];
	assert.ok(rules.length > 0);
	for (const [, selectorList] of rules) {
		for (const selector of selectorList.split(',')) {
			assert.match(selector, /:focus(?:-visible)?\s*$/);
		}
	}
});

test('focus styling has no board-level marker or cross-zone exception', () => {
	assert.doesNotMatch(css, /aulyckanban-view-add-focused/);
	assert.doesNotMatch(
		css,
		/\.aulyckanban-toolbar:has\([^)]*:focus[^)]*\)\s*\+\s*\.aulyckanban-content-area/,
	);
});

test('task editing remains a one-pixel accent state distinct from keyboard focus', () => {
	assert.match(rule('.aulyckanban-task'), /border:\s*1px solid/);
	assert.match(
		css,
		/\.aulyckanban-task\.aulyckanban-task-editing[\s\S]*?border-color:\s*var\(--interactive-accent\)/,
	);
});
