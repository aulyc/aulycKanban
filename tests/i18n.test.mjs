import assert from 'node:assert/strict';
import test from 'node:test';
import i18nModule from '../src/i18n.ts';

const { initI18n, t } = i18nModule;

test('simplified Chinese settings use localized section headings and clear-data copy', async () => {
	initI18n('zh-CN');

	assert.equal(t('settings.dataManagement'), '数据管理');
	assert.equal(t('settings.sync'), '笔记同步');
	assert.equal(t('settings.sync.folder.name'), '同步文件夹');
	assert.equal(
		t('settings.sync.folder.desc'),
		'自动创建并管理每个任务类型及归档任务的 Markdown 笔记',
	);
	assert.equal(t('settings.sync.force.name'), '强制刷新同步');
	assert.equal(t('settings.sync.force.button'), '同步');
	assert.match(t('settings.sync.force.confirm'), /覆盖全部自动同步笔记/);
	assert.equal(t('settings.clear.name'), '清除数据');
	assert.equal(t('settings.clear.button'), '清除');
	assert.equal(t('settings.clear.desc'), '不可恢复的删除所有数据');
	assert.equal(t('settings.about.name'), '关于 aulycKanban');
	assert.equal(t('about.version'), '插件版本');
	assert.equal(t('about.requirements'), '软件要求');
	assert.equal(t('about.website'), '官方网站');
	assert.equal(t('about.acknowledgements'), '致谢');
	assert.match(t('view.deleteData'), /对应 Markdown 会移入恢复目录/);
});

test('English settings retain their localized copy', async () => {
	initI18n('en');

	assert.equal(t('settings.dataManagement'), 'Data management');
	assert.equal(t('settings.sync'), 'Note synchronization');
	assert.equal(t('settings.sync.folder.name'), 'Sync folder');
	assert.equal(t('settings.sync.force.name'), 'Force refresh synchronization');
	assert.equal(t('settings.sync.force.button'), 'Sync');
	assert.equal(t('settings.clear.button'), 'Clear data');
	assert.equal(t('settings.about.name'), 'About aulycKanban');
	assert.equal(t('about.version'), 'Plugin version');
	assert.equal(t('about.website'), 'Official website');
});
