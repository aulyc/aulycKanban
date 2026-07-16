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
	assert.equal(t('settings.sync.folder.name'), '同步文件夹');
	assert.equal(
		t('settings.sync.folder.desc'),
		'自动创建并管理每个任务类型及归档任务的 Markdown 笔记',
	);
	assert.equal(t('settings.clear.button'), '清除');
	assert.equal(t('settings.clear.desc'), '无法撤销的删除全部数据。');
	assert.match(t('view.deleteData'), /对应 Markdown 会移入恢复目录/);
});

test('English settings retain their localized copy', async () => {
	const { initI18n, t } = await loadI18n();
	initI18n('en');

	assert.equal(t('settings.dataManagement'), 'Data management');
	assert.equal(t('settings.sync'), 'Note synchronization');
	assert.equal(t('settings.sync.folder.name'), 'Sync folder');
	assert.equal(t('settings.clear.button'), 'Clear data');
});
