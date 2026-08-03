import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const eslintConfig = readFileSync(new URL('../eslint.config.mjs', import.meta.url), 'utf8');

test('community scorecard CSS findings stay removed without weakening the retained layout', () => {
	assert.doesNotMatch(styles, /!important/);
	assert.doesNotMatch(styles, /:has\(/);
	assert.doesNotMatch(styles, /scrollbar-width\s*:/);
	assert.doesNotMatch(styles, /column-gap\s*:/);
	assert.doesNotMatch(styles, /clip-path\s*:/);
	assert.match(styles, /\.aulyckanban-add-control-focused/);
});

test('the local lint gate uses current Obsidian types and official review rules', () => {
	assert.equal(packageJson.devDependencies['builtin-modules'], undefined);
	assert.equal(packageJson.devDependencies.obsidian, '1.13.1');
	assert.equal(packageJson.devDependencies['eslint-plugin-obsidianmd'], '0.4.1');
	assert.match(eslintConfig, /eslint-plugin-obsidianmd/);
	assert.match(eslintConfig, /obsidianmd\.configs\.recommended/);
});
