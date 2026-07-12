import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/utils/dom.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES2020,
	},
}).outputText;
const module = { exports: {} };
vm.runInNewContext(output, { module, exports: module.exports });

const { getTextareaBorderBoxHeight } = module.exports;

test('textarea border-box height includes both borders', () => {
	assert.equal(getTextareaBorderBoxHeight(37, '1px', '1px'), 39);
});

test('textarea border-box height supports fractional and missing border widths', () => {
	assert.equal(getTextareaBorderBoxHeight(37, '0.5px', ''), 37.5);
});
