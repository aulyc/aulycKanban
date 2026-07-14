import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const uiDir = new URL('../src/ui/', import.meta.url);
const uiSources = readdirSync(uiDir)
	.filter((fileName) => fileName.endsWith('.ts'))
	.map((fileName) => ({
		fileName,
		source: readFileSync(new URL(fileName, uiDir), 'utf8'),
	}));

test('board UI contains no tooltip-triggering attributes or APIs', () => {
	for (const { fileName, source } of uiSources) {
		assert.doesNotMatch(source, /\bsetTooltip\s*\(/, fileName);
		assert.doesNotMatch(source, /setAttribute\(\s*['"]title['"]/, fileName);
		assert.doesNotMatch(source, /['"]aria-label['"]\s*:/, fileName);
		assert.doesNotMatch(source, /setAttribute\(\s*['"]aria-label['"]/, fileName);
		assert.doesNotMatch(source, /data-tooltip/, fileName);
	}
});

test('icon controls keep accessible text visually hidden', () => {
	const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
	const declarations = css.match(
		/\.aulyckanban-accessible-label\s*\{([^}]*)\}/,
	)?.[1] ?? '';

	assert.match(declarations, /position:\s*absolute/);
	assert.match(declarations, /clip-path:\s*inset\(50%\)/);
	assert.match(declarations, /overflow:\s*hidden/);
});
