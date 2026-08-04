import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const expectedDescription =
	'自定义类型和象限的任务看板。\nTask board with custom types and quadrants.';

test('source and distribution manifests keep the fixed bilingual description', async () => {
	const [source, distribution] = await Promise.all([
		readFile(new URL('../manifest.json', import.meta.url), 'utf8'),
		readFile(new URL('../dist/manifest.json', import.meta.url), 'utf8'),
	]);

	assert.equal(JSON.parse(source).description, expectedDescription);
	assert.equal(JSON.parse(distribution).description, expectedDescription);
});
