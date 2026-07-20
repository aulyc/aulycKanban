import assert from 'node:assert/strict';
import test from 'node:test';
import noteSyncModule from '../src/utils/noteSync.ts';

const { buildManagedNotePath, normalizeSyncFolder } = noteSyncModule;

test('managed note paths strip leading icons and replace path separators', async () => {
	assert.equal(buildManagedNotePath('X-aulyc看板', '💼 工作任务'), 'X-aulyc看板/工作任务.md');
	assert.equal(
		buildManagedNotePath('X-aulyc看板', '客户/项目:一期'),
		'X-aulyc看板/客户／项目：一期.md',
	);
});

test('empty managed folder input resolves to the stable default directory', async () => {
	assert.equal(normalizeSyncFolder('  '), 'X-aulyc看板');
	assert.equal(normalizeSyncFolder(' 项目//同步/ '), '项目/同步');
});
