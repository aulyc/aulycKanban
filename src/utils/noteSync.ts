import type { ViewKind } from '../types';

export const DEFAULT_SYNC_FOLDER = 'X-aulyc看板';
export const ARCHIVE_NOTE_TITLE = '归档任务';
export const DELETED_SYNC_FOLDER = '已删除任务类型';
export const PRESERVED_SYNC_FOLDER = '历史同步内容';

/** 将用户输入收敛为 Vault 内的相对文件夹路径。 */
export function normalizeSyncFolder(rawFolder: string): string {
	const normalized = rawFolder
		.trim()
		.replace(/\\/g, '/')
		.replace(/\/{2,}/g, '/');
	const withoutEdges = normalized.replace(/^\/+|\/+$/g, '');
	return withoutEdges || DEFAULT_SYNC_FOLDER;
}

/** 文件名保留可读标题，同时移除导航标题开头的图标。 */
export function managedNoteTitle(rawTitle: string): string {
	const title = rawTitle.trim().replace(/\.md$/iu, '');
	const characters = Array.from(title);
	const firstText = characters.findIndex((character) => /[\p{L}\p{N}]/u.test(character));
	const readable = (firstText >= 0 ? characters.slice(firstText).join('') : title).trim();
	const withoutInvalidFilenameCharacters = readable
		.replace(/[\\/]/g, '／')
		.replace(/:/g, '：')
		.replace(/[?*"<>|#[\]^]/g, ' ')
		.trim();
	const sanitized = Array.from(withoutInvalidFilenameCharacters)
		.map((character) => ((character.codePointAt(0) ?? 0) < 32 ? ' ' : character))
		.join('')
		.replace(/\s{2,}/g, ' ')
		.replace(/[. ]+$/g, '')
		.trim();
	return sanitized || '任务';
}

export function buildManagedNotePath(folder: string, title: string): string {
	return `${normalizeSyncFolder(folder)}/${managedNoteTitle(title)}.md`;
}

export function buildArchiveNotePath(folder: string): string {
	return buildManagedNotePath(folder, ARCHIVE_NOTE_TITLE);
}

export function buildUniqueManagedNotePath(
	basePath: string,
	ordinal: number,
	viewId?: ViewKind,
): string {
	if (ordinal <= 1) return basePath;
	const suffix = ordinal === 2 ? ' (2)' : ` (${ordinal})`;
	const extensionIndex = basePath.toLocaleLowerCase().lastIndexOf('.md');
	if (extensionIndex < 0) return `${basePath}${suffix}`;
	const fallbackSuffix = viewId && ordinal > 99 ? `-${managedNoteTitle(viewId)}` : suffix;
	return `${basePath.slice(0, extensionIndex)}${fallbackSuffix}${basePath.slice(extensionIndex)}`;
}

export function folderFromFilePath(filePath: string): string {
	const normalized = filePath
		.trim()
		.replace(/\\/g, '/')
		.replace(/\/{2,}/g, '/');
	const separator = normalized.lastIndexOf('/');
	return separator > 0 ? normalizeSyncFolder(normalized.slice(0, separator)) : '';
}
