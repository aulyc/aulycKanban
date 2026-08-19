/**
 * 国际化模块
 * 中文为默认语言，英文完整补全
 */

export type UiLanguage = 'system' | 'zh-CN' | 'en';

export function normalizeUiLanguage(value: unknown): UiLanguage {
	return value === 'zh-CN' || value === 'en' ? value : 'system';
}

export function resolveUiLocale(language: UiLanguage, obsidianLocale: string): string {
	return language === 'system' ? obsidianLocale : language;
}

const zh = {
	// 插件级别
	'plugin.ribbonTip': '打开看板',

	// 命令
	'command.openBoard': '打开看板',
	'command.focusView': '聚焦：{title}',
	'data.schema.unsupported': '看板数据由更高版本的插件创建。为避免覆盖，请升级插件后再打开。',
	'data.schema.invalid': '看板数据的版本标记无效。为避免覆盖，插件已停止加载。',

	// 视图
	'view.displayName': 'aulycKanban',
	'view.work': '💼 工作任务',
	'view.personal': '👤 个人任务',
	'view.all': '全部任务',
	'view.add': '新增任务类型',
	'view.addPrompt': '输入任务类型，Enter 添加',
	'view.rename': '重命名',
	'view.delete': '删除任务类型',
	'view.deleteConfirm': '确定删除任务类型“{title}”吗？',
	'view.deleteData':
		'其中 {taskCount} 条任务和 {archiveCount} 条归档任务将永久删除；对应 Markdown 会移入恢复目录。',

	// 列标题
	'column.periodic': '🔄 周期任务',
	'column.urgentImportant': '🔥 重要且紧急',
	'column.importantNotUrgent': '⭐ 重要不紧急',
	'column.urgentNotImportant': '⚡ 紧急不重要',
	'column.notUrgentNotImportant': '💤 不紧急不重要',
	'column.all': '全部象限',

	// 任务操作
	'task.inputPlaceholder': '输入任务，Enter 添加',
	'task.search.placeholder': '搜索任务，Enter 确认',
	'task.search.clear': '清除搜索',
	'task.search.noMatch': '当前范围内没有匹配任务',
	'task.add': '新增任务',
	'task.target.view': '任务类型',
	'task.target.column': '象限',
	'task.addedOutsideSearch': '任务已添加，但不匹配当前搜索',
	'task.confirm.archive': '确认归档该任务吗？',
	'task.confirm.delete': '确认删除该任务吗？此操作不可恢复。',
	'task.select.mode': '多选任务',
	'task.select.cancel': '取消多选',
	'task.select.all': '全选当前结果',
	'task.select.clearAll': '取消全选',
	'task.select.count': '已选 {count} 项',
	'task.move.menu': '移动到…',
	'task.move.selected': '移动所选任务',
	'task.move.title': '移动任务',
	'task.move.count': '移动 {count} 项任务',
	'task.move.keepView': '保持各自原类型',
	'task.move.keepColumn': '保持各自原象限',
	'task.move.confirm': '移动',
	'task.move.success': '已移动 {count} 项任务',
	'task.move.failed': '任务未移动，请检查目标位置',
	'task.drag.count': '拖动 {count} 项任务',

	// 分类管理
	'column.rename': '重命名',
	'column.delete': '删除分类',
	'column.addPrompt': '输入新象限名称',
	'column.deleteConfirm': '确定要删除这个分类吗？',
	'column.deleteMoveTasks': '分类下的任务将移到第一个分类中。',

	// 归档
	'archive.restore': '恢复',
	'archive.empty': '暂无归档任务',
	'archive.archivedAt': '归档于',
	'archive.open': '查看已归档任务',
	'archive.other': '其他',
	'archive.noMatch': '未找到匹配的归档任务',
	'archive.sort.newest': '最新优先',
	'archive.sort.oldest': '最早优先',
	'archive.delete.mode': '选择',
	'archive.delete.cancel': '取消',
	'archive.delete.selected': '删除',
	'archive.delete.selectedCount': '已选 {count} 项',
	'archive.delete.selectAll': '全选',
	'archive.delete.clearAll': '取消全选',
	'archive.delete.selectTask': '选择任务',
	'archive.confirm.restore': '确认恢复该归档任务吗？',
	'archive.confirm.deleteSelected': '将删除选中的 {count} 条归档任务，此操作不可恢复。确认删除吗？',

	// 设置页
	'settings.interface': '界面',
	'settings.language.name': '界面语言',
	'settings.language.desc': '选择插件界面使用的语言',
	'settings.language.system': '跟随 Obsidian',
	'settings.language.zhCN': '简体中文',
	'settings.language.en': 'English',
	'settings.dataManagement': '数据管理',
	'settings.backup.name': '备份数据',
	'settings.backup.desc': '保存JSON格式的看板数据到用户本地',
	'settings.backup.button': '备份',
	'settings.backup.fail': '备份失败',
	'settings.import.name': '导入数据',
	'settings.import.desc': '恢复JSON格式的数据至看板应用中',
	'settings.import.button': '导入',
	'settings.import.confirm': '导入备份将覆盖当前所有数据，是否继续？',
	'settings.import.success': '数据导入成功',
	'settings.import.successMigrated': '已从 {version} 备份格式迁移并导入',
	'settings.import.fail': '导入失败',
	'settings.import.invalidFormat': '无效的备份文件格式',
	'settings.import.duplicateId': '备份包含重复 ID',
	'settings.import.newerVersion': '备份来自更高版本（{version}），请先升级插件',
	'settings.import.unsupportedVersion': '不支持的备份版本：{version}',
	'settings.import.versionMismatch': '备份版本与内容结构不匹配',
	'settings.clear.name': '清除数据',
	'settings.clear.desc': '不可恢复的删除所有数据',
	'settings.clear.button': '清除',
	'settings.clear.warning': '此操作将删除所有任务类型中的任务数据，且无法恢复！',
	'settings.clear.suggestion': '在清除数据前，请先点击"备份数据"按钮，将当前看板数据备份到本地。',
	'settings.clear.backupFirst': '备份数据',
	'settings.clear.confirm': '确认清除',
	'settings.clear.success': '所有任务数据已清除',

	'settings.sync': '笔记同步',
	'settings.sync.folder.name': '同步文件夹',
	'settings.sync.folder.desc': '自动创建并管理每个任务类型及归档任务的 Markdown 笔记',
	'settings.sync.force.name': '强制刷新同步',
	'settings.sync.force.desc': '以当前看板数据重新生成所有任务类型和归档笔记',
	'settings.sync.force.button': '同步',
	'settings.sync.force.running': '正在同步…',
	'settings.sync.force.confirm':
		'将以当前看板数据覆盖全部自动同步笔记。旧版残留内容会移入“历史同步内容”，是否继续？',
	'settings.sync.force.success': '已强制刷新 {count} 个同步笔记',
	'settings.sync.force.fail': '强制刷新失败',
	'settings.about.name': '关于 aulycKanban',
	'settings.about.desc': '查看插件说明与致谢信息。',

	// 关于
	'about.title': '关于 aulycKanban',
	'about.version': '插件版本',
	'about.requirements': '软件要求',
	'about.introduction': '应用介绍',
	'about.introduction.line1':
		'1. aulycKanban 是一款 Obsidian 任务看板插件，通过任务类型与四象限帮助整理工作和个人任务；',
	'about.introduction.line2': '2. 支持任务搜索、归档、恢复，以及任务类型和象限的灵活管理；',
	'about.introduction.line3': '3. 看板数据保存在本地，并支持 JSON 备份、导入和 Markdown 笔记同步。',
	'about.website': '官方网站',
	'about.acknowledgements': '致谢',
	'about.acknowledgements.line1': '1. 感谢伟大的 AI 时代；',
	'about.acknowledgements.line2': '2. 致敬 Codex & Claude；',
	'about.acknowledgements.line3': '3. 感谢 Obsidian 提供开放的插件平台；',
	'about.acknowledgements.line4': '4. 感谢四象限时间管理方法提供的灵感；',
	'about.acknowledgements.line5': '5. 感谢 aulyc 带来的坚持和灵感。',

	// 保存
	'save.fail': '看板数据保存失败，请检查磁盘空间或权限',

	// 同步
	'sync.updated': '笔记已更新',
	'sync.exported': '已成功导出到新笔记',
	'sync.fail': '导出失败',

	// Markdown 生成
	'md.syncTime': '最新同步时间',
	'md.stats': '📊 任务统计',
	'md.totalTasks': '总任务数',
	'md.noTasks': '暂无任务',
	'md.archiveStats': '📦 归档统计',
	'md.archiveTotal': '总归档数',

	// 通用
	confirm: '确定',
	cancel: '取消',
};

/** 全部翻译键；en 通过 Record 约束与 zh 保持完全一致，缺失或多余的键在编译期报错 */
export type I18nKey = keyof typeof zh;

const en: Record<I18nKey, string> = {
	'plugin.ribbonTip': 'Open kanban board',

	'command.openBoard': 'Open kanban board',
	'command.focusView': 'Focus: {title}',
	'data.schema.unsupported':
		'This kanban data was created by a newer version. Upgrade the plugin before opening it.',
	'data.schema.invalid':
		'The kanban data version marker is invalid. Loading stopped to avoid overwriting it.',

	'view.displayName': 'aulycKanban',
	'view.work': '💼 Work',
	'view.personal': '👤 Personal',
	'view.all': 'All tasks',
	'view.add': 'Add task type',
	'view.addPrompt': 'Task type, Enter to add',
	'view.rename': 'Rename',
	'view.delete': 'Delete task type',
	'view.deleteConfirm': 'Delete the “{title}” task type?',
	'view.deleteData':
		'{taskCount} tasks and {archiveCount} archived tasks will be permanently deleted. Its Markdown note will move to recovery.',

	'column.periodic': '🔄 Periodic',
	'column.urgentImportant': '🔥 Urgent & Important',
	'column.importantNotUrgent': '⭐ Important',
	'column.urgentNotImportant': '⚡ Urgent',
	'column.notUrgentNotImportant': '💤 Neither',
	'column.all': 'All quadrants',

	'task.inputPlaceholder': 'Type task, Enter to add',
	'task.search.placeholder': 'Search tasks, Enter to apply',
	'task.search.clear': 'Clear search',
	'task.search.noMatch': 'No tasks match the current filters',
	'task.add': 'Add task',
	'task.target.view': 'Task type',
	'task.target.column': 'Quadrant',
	'task.addedOutsideSearch': 'Task added, but it does not match the current search',
	'task.confirm.archive': 'Archive this task?',
	'task.confirm.delete': 'Delete this task? This cannot be undone.',
	'task.select.mode': 'Select tasks',
	'task.select.cancel': 'Cancel selection',
	'task.select.all': 'Select current results',
	'task.select.clearAll': 'Clear selection',
	'task.select.count': '{count} selected',
	'task.move.menu': 'Move to…',
	'task.move.selected': 'Move selected tasks',
	'task.move.title': 'Move tasks',
	'task.move.count': 'Move {count} tasks',
	'task.move.keepView': 'Keep each task type',
	'task.move.keepColumn': 'Keep each quadrant',
	'task.move.confirm': 'Move',
	'task.move.success': 'Moved {count} tasks',
	'task.move.failed': 'Tasks were not moved. Check the destination.',
	'task.drag.count': 'Dragging {count} tasks',

	'column.rename': 'Rename',
	'column.delete': 'Delete category',
	'column.addPrompt': 'Enter new quadrant name',
	'column.deleteConfirm': 'Are you sure you want to delete this category?',
	'column.deleteMoveTasks': 'Tasks will be moved to the first category.',

	'archive.restore': 'Restore',
	'archive.empty': 'No archived tasks',
	'archive.archivedAt': 'Archived at',
	'archive.open': 'View archived tasks',
	'archive.other': 'Other',
	'archive.noMatch': 'No archived tasks matched',
	'archive.sort.newest': 'Newest first',
	'archive.sort.oldest': 'Oldest first',
	'archive.delete.mode': 'Select',
	'archive.delete.cancel': 'Cancel',
	'archive.delete.selected': 'Delete',
	'archive.delete.selectedCount': '{count} selected',
	'archive.delete.selectAll': 'Select all',
	'archive.delete.clearAll': 'Clear selection',
	'archive.delete.selectTask': 'Select task',
	'archive.confirm.restore': 'Restore this archived task?',
	'archive.confirm.deleteSelected':
		'Delete the {count} selected archived tasks? This cannot be undone.',

	'settings.interface': 'Interface',
	'settings.language.name': 'Interface language',
	'settings.language.desc': 'Choose the language used by the plugin interface',
	'settings.language.system': 'Follow Obsidian',
	'settings.language.zhCN': '简体中文',
	'settings.language.en': 'English',
	'settings.dataManagement': 'Data management',
	'settings.backup.name': 'Backup data',
	'settings.backup.desc': 'Save kanban data as a JSON file',
	'settings.backup.button': 'Backup',
	'settings.backup.fail': 'Backup failed',
	'settings.import.name': 'Import data',
	'settings.import.desc': 'Restore kanban data from a backup JSON file',
	'settings.import.button': 'Import',
	'settings.import.confirm': 'Importing will overwrite all current kanban data. Continue?',
	'settings.import.success': 'Data imported successfully',
	'settings.import.successMigrated': 'Migrated and imported backup format {version}',
	'settings.import.fail': 'Import failed',
	'settings.import.invalidFormat': 'Invalid backup file format',
	'settings.import.duplicateId': 'Backup contains a duplicate ID',
	'settings.import.newerVersion':
		'This backup comes from a newer version ({version}). Upgrade the plugin first.',
	'settings.import.unsupportedVersion': 'Backup version {version} is not supported',
	'settings.import.versionMismatch': 'The backup version does not match its data structure',
	'settings.clear.name': 'Clear all data',
	'settings.clear.desc': 'Delete task data from every task type (irreversible)',
	'settings.clear.button': 'Clear data',
	'settings.clear.warning':
		'This will delete all task data from every task type. This cannot be undone!',
	'settings.clear.suggestion': 'Please backup your data first before clearing.',
	'settings.clear.backupFirst': 'Backup first',
	'settings.clear.confirm': 'Confirm clear',
	'settings.clear.success': 'All task data has been cleared',

	'settings.sync': 'Note synchronization',
	'settings.sync.folder.name': 'Sync folder',
	'settings.sync.folder.desc':
		'Automatically create and manage Markdown notes for each task type and archived tasks',
	'settings.sync.force.name': 'Force refresh synchronization',
	'settings.sync.force.desc':
		'Regenerate every task-type and archive note from the current kanban data',
	'settings.sync.force.button': 'Sync',
	'settings.sync.force.running': 'Synchronizing…',
	'settings.sync.force.confirm':
		'This will overwrite every managed synchronization note with the current kanban data. Legacy content will be moved to “Historical synchronization content”. Continue?',
	'settings.sync.force.success': 'Force-refreshed {count} synchronization notes',
	'settings.sync.force.fail': 'Force refresh failed',
	'settings.about.name': 'About aulycKanban',
	'settings.about.desc': 'View the plugin overview and acknowledgements.',

	'about.title': 'About aulycKanban',
	'about.version': 'Plugin version',
	'about.requirements': 'Requirements',
	'about.introduction': 'Overview',
	'about.introduction.line1':
		'1. aulycKanban is an Obsidian task-board plugin that organizes work and personal tasks by task type and quadrant;',
	'about.introduction.line2':
		'2. It supports search, archiving, restoration, and flexible management of task types and quadrants;',
	'about.introduction.line3':
		'3. Board data stays local, with JSON backup, import, and Markdown note synchronization.',
	'about.website': 'Official website',
	'about.acknowledgements': 'Acknowledgements',
	'about.acknowledgements.line1': '1. Thank you to the remarkable AI era;',
	'about.acknowledgements.line2': '2. A tribute to Codex & Claude;',
	'about.acknowledgements.line3': '3. Thank you to Obsidian for its open plugin platform;',
	'about.acknowledgements.line4':
		'4. Thank you to the four-quadrant time-management method for its inspiration;',
	'about.acknowledgements.line5': '5. Thank you to aulyc for the persistence and inspiration.',

	'save.fail': 'Failed to save kanban data. Check disk space or permissions.',

	'sync.updated': 'Note updated',
	'sync.exported': 'Exported to new note successfully',
	'sync.fail': 'Export failed',

	'md.syncTime': 'Last synced',
	'md.stats': '📊 Task Statistics',
	'md.totalTasks': 'Total tasks',
	'md.noTasks': 'No tasks',
	'md.archiveStats': '📦 Archive Statistics',
	'md.archiveTotal': 'Total archived',

	confirm: 'OK',
	cancel: 'Cancel',
};

/** 当前语言字典 */
let currentLang: Record<I18nKey, string> = zh;
let currentLocale = 'zh-CN';

/**
 * 根据 Obsidian 语言环境初始化国际化
 * 在插件 onload 时调用
 */
export function initI18n(locale: string): void {
	if (locale.startsWith('zh')) {
		currentLang = zh;
		currentLocale = 'zh-CN';
	} else {
		currentLang = en;
		currentLocale = 'en';
	}
}

export function getCurrentLocale(): string {
	return currentLocale;
}

/**
 * 获取翻译文本
 * @param key 翻译键（编译期校验，拼写错误会直接报错）
 */
export function t(key: I18nKey): string {
	return currentLang[key];
}
