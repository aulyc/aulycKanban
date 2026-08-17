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

function declarationValue(declarations, property) {
	return (
		declarations
			.match(new RegExp(`(?:^|;)\\s*${escapeRegExp(property)}\\s*:\\s*([^;]+)`))?.[1]
			?.trim() ?? ''
	);
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

test('ordinary task selection checkbox is anchored at the card top right', () => {
	const checkboxLabel = rule('.aulyckanban-task-select-label');
	assert.equal(declarationValue(checkboxLabel, 'position'), 'absolute');
	assert.equal(declarationValue(checkboxLabel, 'top'), '12px');
	assert.equal(declarationValue(checkboxLabel, 'right'), '12px');
	assert.equal(
		declarationValue(
			rule('.aulyckanban-task-selecting .aulyckanban-task-content'),
			'padding-right',
		),
		'28px',
	);
});

test('ordinary task cards reserve the same metadata action height in and out of selection mode', () => {
	assert.equal(declarationValue(rule('.aulyckanban-task-actions'), 'min-height'), '18px');
});

test('each of the four keyboard zones draws white only from actual focus', () => {
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

test('active quadrant keeps its selected fill, exposes hover feedback, and adds the white focus border', () => {
	const activeFocus = combinedRule([
		'.aulyckanban-nav-item-active:focus',
		'.aulyckanban-nav-item-active:focus-visible',
	]);
	assert.equal(declarationValue(activeFocus, 'background'), 'var(--interactive-accent)');

	const activeHover = combinedRule([
		'.aulyckanban-nav-item-active:hover',
		'.aulyckanban-nav-item-active:focus:hover',
		'.aulyckanban-nav-item-active:focus-visible:hover',
	]);
	assert.equal(declarationValue(activeHover, 'background'), 'var(--interactive-accent-hover)');

	const focus = combinedRule([
		'.aulyckanban-nav-item:focus',
		'.aulyckanban-nav-item:focus-visible',
	]);
	assert.equal(declarationValue(focus, 'border'), '1px solid var(--aulyckanban-selection-border)');
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

test('inactive task type controls use a stronger toolbar-only hover treatment', () => {
	const taskTypeHover = rule(
		'.aulyckanban-toolbar ' +
			'.aulyckanban-tab:not(.aulyckanban-tab-active):not(.aulyckanban-view-add-btn):hover',
	);
	assert.equal(declarationValue(taskTypeHover, 'background'), 'var(--interactive-hover)');
	assert.equal(
		declarationValue(taskTypeHover, 'border-color'),
		'var(--background-modifier-border-hover)',
	);
	assert.equal(
		declarationValue(rule('.aulyckanban-tab:hover'), 'background'),
		'var(--background-modifier-hover)',
	);
});

test('archive control is unfilled while inactive and gains fill plus white border when active', () => {
	const button = rule('.aulyckanban-kanban-container .aulyckanban-tab.aulyckanban-archive-btn');
	assert.equal(declarationValue(button, 'background'), 'transparent');
	assert.equal(declarationValue(button, 'border-color'), 'var(--background-modifier-border)');
	assert.match(button, /color:\s*var\(--color-orange\)/);
	assert.match(button, /width:\s*38px/);
	assert.match(button, /height:\s*38px/);

	const active = rule(
		'.aulyckanban-kanban-container ' +
			'.aulyckanban-tab.aulyckanban-archive-btn.aulyckanban-tab-active',
	);
	assert.match(active, /background:\s*color-mix\([^;]*var\(--color-orange\)/);
	assert.equal(declarationValue(active, 'border-color'), 'var(--aulyckanban-selection-border)');
});

test('task archive hover adopts the toolbar archive semantic color', () => {
	const hover = rule('.aulyckanban-task-archive:hover');
	assert.match(hover, /color:\s*var\(--color-orange\)/);
	assert.doesNotMatch(hover, /var\(--text-error\)/);

	const icon = rule('.aulyckanban-task-archive svg');
	assert.match(icon, /width:\s*16px/);
	assert.match(icon, /height:\s*16px/);
});

test('task type add glyph is optically centered', () => {
	const addButton = rule('.aulyckanban-view-add-btn');
	assert.match(addButton, /display:\s*grid/);
	assert.match(addButton, /place-items:\s*center/);
	assert.match(addButton, /line-height:\s*1/);
	assert.match(addButton, /text-align:\s*center/);
});

test('task type and task list add controls share quadrant hover styling for keyboard focus', () => {
	const addSelectors = [
		'.aulyckanban-kanban-container .aulyckanban-view-add-btn',
		'.aulyckanban-kanban-container .aulyckanban-task-add-btn',
		'.aulyckanban-kanban-container .aulyckanban-nav-add-btn',
	];
	const defaultState = combinedRule(addSelectors);
	assert.notEqual(defaultState, '');
	for (const [property, value] of Object.entries({
		border: '1px dashed var(--background-modifier-border)',
		'border-radius': '6px',
		background: 'transparent',
		'background-image': 'none',
		color: 'var(--text-muted)',
		'box-shadow': 'none',
	})) {
		assert.equal(declarationValue(defaultState, property), value);
	}

	const hoverState = combinedRule(addSelectors.map((selector) => `${selector}:hover`));
	assert.notEqual(hoverState, '');
	assert.equal(declarationValue(hoverState, 'border-color'), 'var(--text-muted)');
	assert.equal(declarationValue(hoverState, 'background'), 'var(--background-modifier-hover)');
	assert.equal(declarationValue(hoverState, 'color'), 'var(--interactive-accent)');

	const focusSelectors = addSelectors.flatMap((selector) => [
		`${selector}:focus`,
		`${selector}:focus-visible`,
	]);
	const focusState = combinedRule(focusSelectors);
	assert.notEqual(focusState, '');
	assert.equal(declarationValue(focusState, 'border'), '1px dashed var(--text-muted)');
	assert.equal(declarationValue(focusState, 'background'), 'var(--background-modifier-hover)');
	assert.equal(declarationValue(focusState, 'color'), 'var(--interactive-accent)');
	assert.equal(declarationValue(focusState, 'outline'), 'none');
	assert.equal(declarationValue(focusState, 'box-shadow'), 'none');
});

test('new task textarea starts at one line while remaining content-sized', () => {
	const declarations = rule('.aulyckanban-kanban-container .aulyckanban-task-create-input');
	assert.equal(
		declarationValue(declarations, 'min-height'),
		'var(--aulyckanban-content-control-height)',
	);
	assert.equal(declarationValue(declarations, 'resize'), 'none');
	assert.equal(declarationValue(declarations, 'overflow'), 'hidden');
});

test('add buttons use hover-like focus while editors keep the white selection border', () => {
	const sharedFocusRule = combinedRule(
		['.aulyckanban-view-add-btn', '.aulyckanban-task-add-btn', '.aulyckanban-nav-add-btn'].flatMap(
			(selector) => [
				`.aulyckanban-kanban-container ${selector}:focus`,
				`.aulyckanban-kanban-container ${selector}:focus-visible`,
			],
		),
	);
	assert.doesNotMatch(sharedFocusRule, /var\(--aulyckanban-selection-border\)/);
	assert.match(sharedFocusRule, /1px dashed var\(--text-muted\)/);

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
	const suppressionRule = rule(
		'.aulyckanban-toolbar.aulyckanban-add-control-focused .aulyckanban-tab.aulyckanban-tab-active',
	);

	assert.notEqual(suppressionRule, '');
	assert.match(suppressionRule, /background:\s*var\(--interactive-normal\)/);
	assert.match(suppressionRule, /color:\s*var\(--text-normal\)/);
	assert.match(suppressionRule, /border-color:\s*var\(--background-modifier-border\)/);
});

test('quadrant add focus owns the only purple selection in category navigation', () => {
	const suppressionRule = rule(
		'.aulyckanban-category-nav.aulyckanban-add-control-focused .aulyckanban-nav-item-active',
	);

	assert.notEqual(suppressionRule, '');
	assert.match(suppressionRule, /background:\s*transparent/);
	assert.match(suppressionRule, /color:\s*var\(--text-normal\)/);
	assert.match(suppressionRule, /border-color:\s*transparent/);
});

test('archive container never draws a full-panel focus frame', () => {
	assert.equal(rule('.aulyckanban-archive-container:focus'), '');
	assert.equal(rule('.aulyckanban-archive-container:focus-visible'), '');
	assert.doesNotMatch(rule('.aulyckanban-archive-container'), /box-shadow/);
});

test('task type drag targets use one complete white border without an outer shadow', () => {
	const dragTarget = combinedRule([
		'.aulyckanban-view-tab.aulyckanban-drop-hover',
		'.aulyckanban-view-tab.aulyckanban-drop-locked',
	]);
	assert.equal(
		declarationValue(dragTarget, 'border'),
		'1px solid var(--aulyckanban-selection-border)',
	);
	assert.equal(declarationValue(dragTarget, 'box-shadow'), 'none');
});

test('white selection borders belong to focus, the active archive, or drag targets', () => {
	const rules = [
		...css.matchAll(/([^{}]+)\{([^{}]*var\(--aulyckanban-selection-border\)[^{}]*)\}/g),
	];
	assert.ok(rules.length > 0);
	const permittedStateSelectors = new Set([
		'.aulyckanban-kanban-container .aulyckanban-tab.aulyckanban-archive-btn.aulyckanban-tab-active',
		'.aulyckanban-view-tab.aulyckanban-drop-hover',
		'.aulyckanban-view-tab.aulyckanban-drop-locked',
	]);
	for (const [, selectorList] of rules) {
		for (const selector of selectorList.split(',')) {
			const normalizedSelector = selector.trim();
			assert.equal(
				/:focus(?:-visible)?$/.test(normalizedSelector) ||
					permittedStateSelectors.has(normalizedSelector),
				true,
				`unexpected white selection border selector: ${normalizedSelector}`,
			);
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
