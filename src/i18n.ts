/**
 * 国际化模块
 * 中文为默认语言，英文完整补全
 */

interface I18nStrings {
	[key: string]: string;
}

const zh: I18nStrings = {
	// 插件级别
	'plugin.name': 'X-aulyc 看板',
	'plugin.ribbonTip': '打开看板',

	// 命令
	'command.openBoard': '打开看板',
	'command.focusWork': '聚焦：工作任务',
	'command.focusPersonal': '聚焦：个人任务',

	// 视图
	'view.displayName': 'X-aulyc 看板',
	'view.work': '💼 工作任务',
	'view.personal': '👤 个人任务',

	// 列标题
	'column.periodic': '🔄 周期任务',
	'column.urgentImportant': '🔥 重要且紧急',
	'column.importantNotUrgent': '⭐ 重要不紧急',
	'column.urgentNotImportant': '⚡ 紧急不重要',
	'column.notUrgentNotImportant': '💤 不紧急不重要',

	// 任务操作
	'task.add': '+ 添加任务',
	'task.addTitle': '添加任务',
	'task.addPlaceholder': '请输入任务内容（支持换行，Ctrl+Enter 提交）',
	'task.editTitle': '编辑任务',
	'task.editPlaceholder': '修改任务内容（支持换行，Ctrl+Enter 提交）',
	'task.deleteConfirm': '确定要删除这个任务吗？',
	'task.inputPlaceholder': '输入任务，Enter 添加',
	'task.submit': '确定',
	'task.cancel': '取消',

	// 分类管理
	'column.rename': '重命名',
	'column.delete': '删除分类',
	'column.addPrompt': '输入新分类名称',
	'column.renamePrompt': '输入新名称',
	'column.deleteConfirm': '确定要删除这个分类吗？',
	'column.deleteMoveTasks': '分类下的任务将移到第一个分类中。',

	// 列快捷键命令
	'command.focusPeriodic': '聚焦到：🔄 周期任务',
	'command.focusUrgentImportant': '聚焦到：🔥 重要且紧急',
	'command.focusImportantNotUrgent': '聚焦到：⭐ 重要不紧急',
	'command.focusUrgentNotImportant': '聚焦到：⚡ 紧急不重要',
	'command.focusNotUrgentNotImportant': '聚焦到：💤 不紧急不重要',

	// 归档
	'archive.title': '📦 归档',
	'archive.button': '归档',
	'archive.back': '← 返回看板',
	'archive.restore': '恢复',
	'archive.empty': '暂无归档任务',
	'archive.archivedAt': '归档于',
	'archive.tooltip': '查看已归档任务',
	'archive.other': '📁 其他',

	// 设置页
	'settings.heading': '看板设置',
	'settings.open': '打开设置',
	'settings.appearance': 'Appearance',
	'settings.appearance.desc': '外观设置',
	'settings.icon.name': '自定义图标',
	'settings.icon.desc': '上传自定义看板图标（PNG 格式，建议 128×128，不超过 500KB）',
	'settings.icon.upload': '选择图标文件',
	'settings.icon.reset': '恢复默认',
	'settings.icon.resetConfirm': '确定要恢复默认图标吗？',
	'settings.icon.current': '当前图标',
	'settings.icon.custom': '自定义图标',
	'settings.icon.default': '默认图标',
	'settings.icon.formatError': '请上传 PNG 格式的图片',
	'settings.icon.sizeError': '图片大小不能超过 500KB',
	'settings.icon.selected': '图标已选择，保存后生效',
	'settings.icon.restored': '已恢复默认图标',

	'settings.dataManagement': 'Data management',
	'settings.dataManagement.desc': '数据管理',
	'settings.backup.name': '备份数据',
	'settings.backup.desc': '将看板数据以 JSON 文件保存到本地',
	'settings.backup.button': '备份',
	'settings.backup.success': '备份文件已下载',
	'settings.backup.fail': '备份失败',
	'settings.import.name': '导入数据',
	'settings.import.desc': '从已备份的 JSON 文件恢复至看板中',
	'settings.import.button': '导入',
	'settings.import.confirm': '导入备份将覆盖当前所有看板数据，是否继续？',
	'settings.import.success': '数据导入成功',
	'settings.import.fail': '导入失败',
	'settings.import.invalidFormat': '无效的备份文件格式',
	'settings.clear.name': '清除所有数据',
	'settings.clear.desc': '删除工作任务和个人任务中的所有任务数据（不可恢复）',
	'settings.clear.button': '清除数据',
	'settings.clear.title': '确认清除所有数据？',
	'settings.clear.warning': '此操作将删除工作任务和个人任务中的所有任务数据，且无法恢复！',
	'settings.clear.suggestion': '在清除数据前，请先点击"备份数据"按钮，将当前看板数据备份到本地。',
	'settings.clear.backupFirst': '先备份数据',
	'settings.clear.confirm': '确认清除',
	'settings.clear.success': '所有任务数据已清除',

	'settings.sync': 'Note synchronization',
	'settings.sync.desc': '笔记同步',
	'settings.sync.workPath.name': '工作任务同步文件',
	'settings.sync.workPath.desc': '工作任务看板同步到的 Markdown 文件路径（例如：看板/工作任务.md）',
	'settings.sync.personalPath.name': '个人任务同步文件',
	'settings.sync.personalPath.desc': '个人任务看板同步到的 Markdown 文件路径（例如：看板/个人任务.md）',
	'settings.sync.archivePath.name': '归档同步文件',
	'settings.sync.archivePath.desc': '归档任务同步到的 Markdown 文件路径（例如：看板/归档任务.md）',
	'settings.sync.hint': '看板变动会自动同步到对应笔记',
	'settings.sync.duplicateError': '同步文件路径不能重复',
	'settings.saved': '设置已保存',

	// 同步
	'sync.updated': '笔记已更新',
	'sync.exported': '已成功导出到新笔记',
	'sync.fail': '导出失败',
	'sync.noTarget': '请先在设置中配置同步文件路径',

	// Markdown 生成
	'md.syncTime': '最新同步时间',
	'md.stats': '📊 任务统计',
	'md.totalTasks': '总任务数',
	'md.completed': '已完成',
	'md.completionRate': '完成率',
	'md.inProgress': '进行中',
	'md.completedSection': '已完成',
	'md.noTasks': '暂无任务',

	// 通用
	'confirm': '确定',
	'cancel': '取消',
};

const en: I18nStrings = {
	'plugin.name': 'X-aulyc Kanban',
	'plugin.ribbonTip': 'Open kanban board',

	'command.openBoard': 'Open kanban board',
	'command.focusWork': 'Focus: Work tasks',
	'command.focusPersonal': 'Focus: Personal tasks',

	'view.displayName': 'X-aulyc Kanban',
	'view.work': '💼 Work',
	'view.personal': '👤 Personal',

	'column.periodic': '🔄 Periodic',
	'column.urgentImportant': '🔥 Urgent & Important',
	'column.importantNotUrgent': '⭐ Important',
	'column.urgentNotImportant': '⚡ Urgent',
	'column.notUrgentNotImportant': '💤 Neither',

	'task.add': '+ Add task',
	'task.addTitle': 'Add task',
	'task.addPlaceholder': 'Enter task content (supports line breaks, Ctrl+Enter to submit)',
	'task.editTitle': 'Edit task',
	'task.editPlaceholder': 'Edit task content (supports line breaks, Ctrl+Enter to submit)',
	'task.deleteConfirm': 'Are you sure you want to delete this task?',
	'task.inputPlaceholder': 'Type task, Enter to add',
	'task.submit': 'Submit',
	'task.cancel': 'Cancel',

	'column.rename': 'Rename',
	'column.delete': 'Delete category',
	'column.addPrompt': 'Enter new category name',
	'column.renamePrompt': 'Enter new name',
	'column.deleteConfirm': 'Are you sure you want to delete this category?',
	'column.deleteMoveTasks': 'Tasks will be moved to the first category.',

	'command.focusPeriodic': 'Focus: 🔄 Periodic',
	'command.focusUrgentImportant': 'Focus: 🔥 Urgent & Important',
	'command.focusImportantNotUrgent': 'Focus: ⭐ Important',
	'command.focusUrgentNotImportant': 'Focus: ⚡ Urgent',
	'command.focusNotUrgentNotImportant': 'Focus: 💤 Neither',

	'archive.title': '📦 Archive',
	'archive.button': 'Archive',
	'archive.back': '← Back to board',
	'archive.restore': 'Restore',
	'archive.empty': 'No archived tasks',
	'archive.archivedAt': 'Archived at',
	'archive.tooltip': 'View archived tasks',
	'archive.other': '📁 Other',

	'settings.heading': 'Kanban settings',
	'settings.open': 'Open settings',
	'settings.appearance': 'Appearance',
	'settings.appearance.desc': 'Appearance settings',
	'settings.icon.name': 'Custom icon',
	'settings.icon.desc': 'Upload a custom kanban icon (PNG, recommended 128x128, max 500KB)',
	'settings.icon.upload': 'Choose icon file',
	'settings.icon.reset': 'Reset to default',
	'settings.icon.resetConfirm': 'Are you sure you want to reset to the default icon?',
	'settings.icon.current': 'Current icon',
	'settings.icon.custom': 'Custom icon',
	'settings.icon.default': 'Default icon',
	'settings.icon.formatError': 'Please upload a PNG image',
	'settings.icon.sizeError': 'Image size cannot exceed 500KB',
	'settings.icon.selected': 'Icon selected, will take effect after saving',
	'settings.icon.restored': 'Default icon restored',

	'settings.dataManagement': 'Data management',
	'settings.dataManagement.desc': 'Data management',
	'settings.backup.name': 'Backup data',
	'settings.backup.desc': 'Save kanban data as a JSON file',
	'settings.backup.button': 'Backup',
	'settings.backup.success': 'Backup file downloaded',
	'settings.backup.fail': 'Backup failed',
	'settings.import.name': 'Import data',
	'settings.import.desc': 'Restore kanban data from a backup JSON file',
	'settings.import.button': 'Import',
	'settings.import.confirm': 'Importing will overwrite all current kanban data. Continue?',
	'settings.import.success': 'Data imported successfully',
	'settings.import.fail': 'Import failed',
	'settings.import.invalidFormat': 'Invalid backup file format',
	'settings.clear.name': 'Clear all data',
	'settings.clear.desc': 'Delete all task data from work and personal boards (irreversible)',
	'settings.clear.button': 'Clear data',
	'settings.clear.title': 'Confirm clear all data?',
	'settings.clear.warning': 'This will delete all task data from work and personal boards. This cannot be undone!',
	'settings.clear.suggestion': 'Please backup your data first before clearing.',
	'settings.clear.backupFirst': 'Backup first',
	'settings.clear.confirm': 'Confirm clear',
	'settings.clear.success': 'All task data has been cleared',

	'settings.sync': 'Note synchronization',
	'settings.sync.desc': 'Note synchronization',
	'settings.sync.workPath.name': 'Work tasks sync file',
	'settings.sync.workPath.desc': 'Markdown file path to sync work tasks (e.g. Kanban/Work Tasks.md)',
	'settings.sync.personalPath.name': 'Personal tasks sync file',
	'settings.sync.personalPath.desc': 'Markdown file path to sync personal tasks (e.g. Kanban/Personal Tasks.md)',
	'settings.sync.archivePath.name': 'Archive sync file',
	'settings.sync.archivePath.desc': 'Markdown file path to sync archived tasks (e.g. Kanban/Archive.md)',
	'settings.sync.hint': 'Board changes are automatically synced to the corresponding note',
	'settings.sync.duplicateError': 'Sync file paths cannot be the same',
	'settings.saved': 'Settings saved',

	'sync.updated': 'Note updated',
	'sync.exported': 'Exported to new note successfully',
	'sync.fail': 'Export failed',
	'sync.noTarget': 'Please configure sync file path in settings first',

	'md.syncTime': 'Last synced',
	'md.stats': '📊 Task Statistics',
	'md.totalTasks': 'Total tasks',
	'md.completed': 'Completed',
	'md.completionRate': 'Completion rate',
	'md.inProgress': 'In progress',
	'md.completedSection': 'Completed',
	'md.noTasks': 'No tasks',

	'confirm': 'OK',
	'cancel': 'Cancel',
};

/** 当前语言字典 */
let currentLang: I18nStrings = zh;
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
 * @param key 翻译键
 * @returns 翻译后的文本，找不到时返回 key 本身
 */
export function t(key: string): string {
	return currentLang[key] ?? key;
}
