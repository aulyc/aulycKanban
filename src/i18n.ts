/**
 * 国际化模块
 * 中文为默认语言，英文完整补全
 */

const zh = {
	// 插件级别
	'plugin.ribbonTip': '打开看板',

	// 命令
	'command.openBoard': '打开看板',
	'command.focusWork': '聚焦：工作任务',
	'command.focusPersonal': '聚焦：个人任务',

	// 视图
	'view.displayName': 'aulyckanban',
	'view.work': '💼 工作任务',
	'view.personal': '👤 个人任务',
	'view.add': '新增任务类型',
	'view.addPrompt': '输入任务类型，Enter 添加',

	// 列标题
	'column.periodic': '🔄 周期任务',
	'column.urgentImportant': '🔥 重要且紧急',
	'column.importantNotUrgent': '⭐ 重要不紧急',
	'column.urgentNotImportant': '⚡ 紧急不重要',
	'column.notUrgentNotImportant': '💤 不紧急不重要',

	// 任务操作
	'task.inputPlaceholder': '输入任务，Enter 添加',
	'task.confirm.archive': '确认归档该任务吗？',
	'task.confirm.delete': '确认删除该任务吗？此操作不可恢复。',

	// 分类管理
	'column.rename': '重命名',
	'column.delete': '删除分类',
	'column.addPrompt': '输入新分类名称',
	'column.deleteConfirm': '确定要删除这个分类吗？',
	'column.deleteMoveTasks': '分类下的任务将移到第一个分类中。',

	// 归档
	'archive.restore': '恢复',
	'archive.empty': '暂无归档任务',
	'archive.archivedAt': '归档于',
	'archive.tooltip': '查看已归档任务',
	'archive.other': '其他',
	'archive.noMatch': '未找到匹配的归档任务',
	'archive.sort.label': '时间排序',
	'archive.sort.newest': '倒序',
	'archive.sort.oldest': '正序',
	'archive.searchPlaceholder': '搜索归档任务内容...',
	'archive.searchClear': '清除',
	'archive.delete.mode': '删除任务',
	'archive.delete.exitMode': '退出删除',
	'archive.delete.selected': '删除选中',
	'archive.delete.filtered': '删除当前列表',
	'archive.delete.selectAll': '全选',
	'archive.delete.unselectAll': '取消全选',
	'archive.delete.selectTask': '选择任务',
	'archive.confirm.restore': '确认恢复该归档任务吗？',
	'archive.confirm.deleteSelected': '确认删除选中的归档任务吗？此操作不可恢复。',
	'archive.confirm.deleteFiltered': '将删除当前筛选出的 {count} 条归档任务，此操作不可恢复。确认删除吗？',

	// 设置页
	'settings.dataManagement': 'Data management',
	'settings.backup.name': '备份数据',
	'settings.backup.desc': '保存JSON格式的看板数据到用户本地',
	'settings.backup.button': '备份',
	'settings.backup.fail': '备份失败',
	'settings.import.name': '导入数据',
	'settings.import.desc': '恢复JSON格式的数据至看板应用中',
	'settings.import.button': '导入',
	'settings.import.confirm': '导入备份将覆盖当前所有数据，是否继续？',
	'settings.import.success': '数据导入成功',
	'settings.import.fail': '导入失败',
	'settings.import.invalidFormat': '无效的备份文件格式',
	'settings.clear.name': '清除所有数据',
	'settings.clear.desc': '删除所有任务类型中的任务数据（不可恢复）',
	'settings.clear.button': '清除数据',
	'settings.clear.warning': '此操作将删除所有任务类型中的任务数据，且无法恢复！',
	'settings.clear.suggestion': '在清除数据前，请先点击"备份数据"按钮，将当前看板数据备份到本地。',
	'settings.clear.backupFirst': '备份数据',
	'settings.clear.confirm': '确认清除',
	'settings.clear.success': '所有任务数据已清除',

	'settings.sync': 'Note synchronization',
	'settings.sync.viewPath.suffix': '同步文件',
	'settings.sync.viewPath.desc': '该任务类型同步到的 Markdown 文件路径',
	'settings.sync.archivePath.name': '归档同步文件',
	'settings.sync.archivePath.desc': '归档任务同步到的 Markdown 文件路径（例如：看板/归档任务.md）',
	'settings.sync.archivePath.placeholder': '看板/归档任务.md',
	'settings.sync.hint': '看板变动会自动同步到对应笔记',
	'settings.sync.duplicateError': '同步文件路径不能重复',

	// 保存
	'save.fail': '看板数据保存失败，请检查磁盘空间或权限',

	// 同步
	'sync.updated': '笔记已更新',
	'sync.exported': '已成功导出到新笔记',
	'sync.fail': '导出失败',
	'sync.noTarget': '请先在设置中配置同步文件路径',

	// Markdown 生成
	'md.syncTime': '最新同步时间',
	'md.stats': '📊 任务统计',
	'md.totalTasks': '总任务数',
	'md.noTasks': '暂无任务',
	'md.archiveStats': '📦 归档统计',
	'md.archiveTotal': '总归档数',

	// 通用
	'confirm': '确定',
	'cancel': '取消',
};

/** 全部翻译键；en 通过 Record 约束与 zh 保持完全一致，缺失或多余的键在编译期报错 */
export type I18nKey = keyof typeof zh;

const en: Record<I18nKey, string> = {
	'plugin.ribbonTip': 'Open kanban board',

	'command.openBoard': 'Open kanban board',
	'command.focusWork': 'Focus: Work tasks',
	'command.focusPersonal': 'Focus: Personal tasks',

	'view.displayName': 'aulyckanban',
	'view.work': '💼 Work',
	'view.personal': '👤 Personal',
	'view.add': 'Add task type',
	'view.addPrompt': 'Task type, Enter to add',

	'column.periodic': '🔄 Periodic',
	'column.urgentImportant': '🔥 Urgent & Important',
	'column.importantNotUrgent': '⭐ Important',
	'column.urgentNotImportant': '⚡ Urgent',
	'column.notUrgentNotImportant': '💤 Neither',

	'task.inputPlaceholder': 'Type task, Enter to add',
	'task.confirm.archive': 'Archive this task?',
	'task.confirm.delete': 'Delete this task? This cannot be undone.',

	'column.rename': 'Rename',
	'column.delete': 'Delete category',
	'column.addPrompt': 'Enter new category name',
	'column.deleteConfirm': 'Are you sure you want to delete this category?',
	'column.deleteMoveTasks': 'Tasks will be moved to the first category.',

	'archive.restore': 'Restore',
	'archive.empty': 'No archived tasks',
	'archive.archivedAt': 'Archived at',
	'archive.tooltip': 'View archived tasks',
	'archive.other': 'Other',
	'archive.noMatch': 'No archived tasks matched',
	'archive.sort.label': 'Sort',
	'archive.sort.newest': 'Newest',
	'archive.sort.oldest': 'Oldest',
	'archive.searchPlaceholder': 'Search archived tasks...',
	'archive.searchClear': 'Clear',
	'archive.delete.mode': 'Delete tasks',
	'archive.delete.exitMode': 'Exit delete mode',
	'archive.delete.selected': 'Delete selected',
	'archive.delete.filtered': 'Delete current list',
	'archive.delete.selectAll': 'Select all',
	'archive.delete.unselectAll': 'Unselect all',
	'archive.delete.selectTask': 'Select task',
	'archive.confirm.restore': 'Restore this archived task?',
	'archive.confirm.deleteSelected': 'Delete selected archived tasks? This cannot be undone.',
	'archive.confirm.deleteFiltered': 'Delete the {count} archived tasks currently shown? This cannot be undone.',

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
	'settings.import.fail': 'Import failed',
	'settings.import.invalidFormat': 'Invalid backup file format',
	'settings.clear.name': 'Clear all data',
	'settings.clear.desc': 'Delete task data from every task type (irreversible)',
	'settings.clear.button': 'Clear data',
	'settings.clear.warning': 'This will delete all task data from every task type. This cannot be undone!',
	'settings.clear.suggestion': 'Please backup your data first before clearing.',
	'settings.clear.backupFirst': 'Backup first',
	'settings.clear.confirm': 'Confirm clear',
	'settings.clear.success': 'All task data has been cleared',

	'settings.sync': 'Note synchronization',
	'settings.sync.viewPath.suffix': ' sync file',
	'settings.sync.viewPath.desc': 'Markdown file path for this task type',
	'settings.sync.archivePath.name': 'Archive sync file',
	'settings.sync.archivePath.desc': 'Markdown file path to sync archived tasks (e.g. Kanban/Archive.md)',
	'settings.sync.archivePath.placeholder': 'Kanban/Archive.md',
	'settings.sync.hint': 'Board changes are automatically synced to the corresponding note',
	'settings.sync.duplicateError': 'Sync file paths cannot be the same',

	'save.fail': 'Failed to save kanban data. Check disk space or permissions.',

	'sync.updated': 'Note updated',
	'sync.exported': 'Exported to new note successfully',
	'sync.fail': 'Export failed',
	'sync.noTarget': 'Please configure sync file path in settings first',

	'md.syncTime': 'Last synced',
	'md.stats': '📊 Task Statistics',
	'md.totalTasks': 'Total tasks',
	'md.noTasks': 'No tasks',
	'md.archiveStats': '📦 Archive Statistics',
	'md.archiveTotal': 'Total archived',

	'confirm': 'OK',
	'cancel': 'Cancel',
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
