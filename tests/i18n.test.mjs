import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

async function loadI18n() {
	const bundle = await build({
		entryPoints: [new URL('../src/i18n.ts', import.meta.url).pathname],
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

test('simplified Chinese settings use localized section headings and clear-data copy', async () => {
	const { initI18n, t } = await loadI18n();
	initI18n('zh-CN');

	assert.equal(t('settings.dataManagement'), '数据管理');
	assert.equal(t('settings.sync'), '笔记同步');
	assert.equal(t('settings.sync.mode.aggregate'), '单一汇总笔记（推荐）');
	assert.equal(t('settings.sync.mode.perView'), '按任务类型分笔记（兼容）');
	assert.equal(t('settings.sync.aggregatePath.name'), '全部任务同步文件');
	assert.equal(t('settings.clear.button'), '清除');
	assert.equal(t('settings.clear.desc'), '无法撤销的删除全部数据。');
});

test('English settings retain their localized copy', async () => {
	const { initI18n, t } = await loadI18n();
	initI18n('en');

	assert.equal(t('settings.dataManagement'), 'Data management');
	assert.equal(t('settings.sync'), 'Note synchronization');
	assert.equal(t('settings.sync.mode.aggregate'), 'Single aggregate note (recommended)');
	assert.equal(t('settings.clear.button'), 'Clear data');
});
