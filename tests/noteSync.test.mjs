import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

async function loadNoteSync() {
	const bundle = await build({
		entryPoints: [new URL('../src/utils/noteSync.ts', import.meta.url).pathname],
		bundle: true,
		format: 'cjs',
		platform: 'node',
		write: false,
		logLevel: 'silent',
	});
	const module = { exports: {} };
	vm.runInNewContext(bundle.outputFiles[0].text, { module, exports: module.exports });
	return module.exports;
}

test('managed note paths strip leading icons and replace path separators', async () => {
	const { buildManagedNotePath } = await loadNoteSync();

	assert.equal(buildManagedNotePath('X-aulyc看板', '💼 工作任务'), 'X-aulyc看板/工作任务.md');
	assert.equal(
		buildManagedNotePath('X-aulyc看板', '客户/项目:一期'),
		'X-aulyc看板/客户／项目：一期.md',
	);
});

test('empty managed folder input resolves to the stable default directory', async () => {
	const { normalizeSyncFolder } = await loadNoteSync();

	assert.equal(normalizeSyncFolder('  '), 'X-aulyc看板');
	assert.equal(normalizeSyncFolder(' 项目//同步/ '), '项目/同步');
});
