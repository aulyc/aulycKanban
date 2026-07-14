import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rule(selector) {
	return css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

function combinedRule(selectors) {
	const selectorPattern = selectors.map(escapeRegExp).join('\\s*,\\s*');
	return css.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
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
		rule('.aulyckanban-kanban-container .aulyckanban-inline-input:focus'),
	];
	for (const declarations of focusRules) {
		assert.notEqual(declarations, '');
		assert.match(declarations, /var\(--aulyckanban-selection-border\)/);
	}
});

test('add buttons and editors use their own real focus for the white border', () => {
	for (const selectors of [
		['.aulyckanban-nav-add-btn:focus', '.aulyckanban-nav-add-btn:focus-visible'],
		['.aulyckanban-view-add-btn:focus', '.aulyckanban-view-add-btn:focus-visible'],
	]) {
		assert.notEqual(combinedRule(selectors), '');
	}

	for (const selector of [
		'.aulyckanban-kanban-container .aulyckanban-view-inline-input:focus',
		'.aulyckanban-kanban-container .aulyckanban-nav-inline-input:focus',
		'.aulyckanban-kanban-container .aulyckanban-archive-search:focus',
	]) {
		assert.match(rule(selector), /var\(--aulyckanban-selection-border\)/);
	}
});

test('every white selection border reference belongs to a focus selector', () => {
	const rules = [...css.matchAll(/([^{}]+)\{([^{}]*var\(--aulyckanban-selection-border\)[^{}]*)\}/g)];
	assert.ok(rules.length > 0);
	for (const [, selectorList] of rules) {
		for (const selector of selectorList.split(',')) {
			assert.match(selector, /:focus(?:-visible)?\s*$/);
		}
	}
});

test('focus styling has no path-specific board marker or cross-zone exception', () => {
	assert.doesNotMatch(css, /aulyckanban-view-add-focused/);
	assert.doesNotMatch(css, /:has\([^)]*:focus[^)]*\)[^{]*aulyckanban-(?:tab|nav-item)-active/);
});

test('task editing remains a one-pixel accent state distinct from keyboard focus', () => {
	assert.match(rule('.aulyckanban-task'), /border:\s*1px solid/);
	assert.match(
		css,
		/\.aulyckanban-task\.aulyckanban-task-editing[\s\S]*?border-color:\s*var\(--interactive-accent\)/,
	);
});
