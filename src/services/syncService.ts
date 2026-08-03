import { Notice, normalizePath, TFile, Vault } from 'obsidian';
import type { KanbanStore } from '../store';
import type { Task, TaskView, ViewKind } from '../types';
import { t } from '../i18n';
import { generateMarkdown, syncMetadata } from '../utils/markdown';
import { formatDateTime, formatDateTimeMinute } from '../utils/datetime';
import { getArchivedAtIso, getArchivedAtTime } from '../utils/task';
import {
	buildArchiveNotePath,
	buildManagedNotePath,
	buildUniqueManagedNotePath,
	DELETED_SYNC_FOLDER,
	managedNoteTitle,
	normalizeSyncFolder,
	PRESERVED_SYNC_FOLDER,
} from '../utils/noteSync';
import { ARCHIVE_UNCATEGORIZED_ID, PERFORMANCE } from '../constants';

const SYNC_START = '<!-- XAULYC_KANBAN:START -->';
const SYNC_END = '<!-- XAULYC_KANBAN:END -->';

type ManagedOwner = { kind: 'view'; id: ViewKind } | { kind: 'archive' };
type KnownView = { title: string; path: string };

export interface ForceSyncResult {
	syncedCount: number;
	totalCount: number;
}

export class VaultSyncService {
	private syncTimeout: number | null = null;
	private pendingAllViews = false;
	private pendingArchive = false;
	private readonly pendingViewIds = new Set<ViewKind>();
	private knownViews = new Map<ViewKind, KnownView>();
	private knownArchivePath: string;
	private syncChain: Promise<void> = Promise.resolve();

	constructor(
		private readonly vault: Vault,
		private readonly store: KanbanStore,
	) {
		const settings = store.getSettings();
		for (const view of store.getTaskViews()) {
			this.knownViews.set(view.id, {
				title: view.title,
				path: settings.viewSyncTargets[view.id]?.filePath ?? '',
			});
		}
		this.knownArchivePath = settings.archive?.filePath ?? '';
	}

	/** 插件加载时立即接管或创建全部自动同步笔记。 */
	async initialize(silent = true): Promise<void> {
		await this.enqueueSync(async () => {
			await this.reconcileManagedNotes();
			await Promise.all([this.syncAllViews(silent), this.syncArchive(silent)]);
		});
	}

	scheduleSyncCurrentView(): void {
		this.scheduleSyncView(this.store.getCurrentView());
	}

	scheduleSyncView(viewId: ViewKind): void {
		this.pendingViewIds.add(viewId);
		this.pendingArchive = true;
		this.scheduleSync();
	}

	scheduleSyncAllViews(): void {
		this.pendingAllViews = true;
		this.pendingArchive = true;
		this.scheduleSync();
	}

	scheduleSyncArchive(): void {
		this.pendingArchive = true;
		this.scheduleSync();
	}

	private scheduleSync(): void {
		if (this.syncTimeout) window.clearTimeout(this.syncTimeout);
		this.syncTimeout = window.setTimeout(() => {
			this.syncTimeout = null;
			void this.flushPending();
		}, this.store.getSettings().syncDebounce ?? PERFORMANCE.SYNC_DEBOUNCE);
	}

	private async flushPending(): Promise<void> {
		const syncAll = this.pendingAllViews;
		const syncArchive = this.pendingArchive;
		const viewIds = [...this.pendingViewIds];
		this.pendingAllViews = false;
		this.pendingArchive = false;
		this.pendingViewIds.clear();
		await this.enqueueSync(async () => {
			await this.reconcileManagedNotes();
			if (syncAll) await this.syncAllViews(true);
			else await this.syncViews(viewIds, true);
			if (syncArchive) await this.syncArchive(true);
		});
	}

	async syncCurrentView(silent = false): Promise<void> {
		await this.enqueueSync(async () => {
			await this.reconcileManagedNotes();
			await this.syncView(this.store.getCurrentView(), silent);
		});
	}

	async syncConfiguredTargets(silent = false): Promise<void> {
		await this.initialize(silent);
	}

	/** 以当前已保存的看板数据严格重建全部受管笔记，并把失败传播给调用方。 */
	async forceSyncAll(): Promise<ForceSyncResult> {
		await this.store.saveNow();
		this.discardPendingSchedule();
		return this.enqueueStrictSync(async () => {
			await this.reconcileManagedNotes();
			const settings = this.store.getSettings();
			const jobs: Array<{ path: string; run: () => Promise<void> }> = [];
			for (const view of this.store.getTaskViews()) {
				const path = settings.viewSyncTargets[view.id]?.filePath;
				if (!path) throw new Error(`Missing managed note path for ${view.title}`);
				jobs.push({
					path,
					run: () => this.writeToFile(normalizePath(path), generateMarkdown(view), true),
				});
			}
			const archivePath = settings.archive?.filePath;
			if (!archivePath) throw new Error('Missing managed archive note path');
			jobs.push({
				path: archivePath,
				run: () =>
					this.writeToFile(
						normalizePath(archivePath),
						`${syncMetadata('archive')}\n${this.generateArchiveMarkdown()}`,
						true,
					),
			});

			let syncedCount = 0;
			const failures: string[] = [];
			await Promise.all(
				jobs.map(async (job) => {
					try {
						await job.run();
						syncedCount += 1;
					} catch (error) {
						const detail = error instanceof Error ? error.message : String(error);
						failures.push(`${job.path}: ${detail}`);
					}
				}),
			);
			if (failures.length > 0) throw new Error(failures.join('；'));
			return { syncedCount, totalCount: jobs.length };
		});
	}

	private async enqueueSync(work: () => Promise<void>): Promise<void> {
		const next = this.syncChain.then(work);
		this.syncChain = next.catch((error) => {
			console.error('[aulycKanban] Managed note synchronization failed:', error);
		});
		await this.syncChain;
	}

	private async enqueueStrictSync<T>(work: () => Promise<T>): Promise<T> {
		const next = this.syncChain.then(work);
		this.syncChain = next.then(
			() => undefined,
			(error) => {
				console.error('[aulycKanban] Managed note synchronization failed:', error);
			},
		);
		return next;
	}

	private discardPendingSchedule(): void {
		if (this.syncTimeout) window.clearTimeout(this.syncTimeout);
		this.syncTimeout = null;
		this.pendingAllViews = false;
		this.pendingArchive = false;
		this.pendingViewIds.clear();
	}

	private async reconcileManagedNotes(): Promise<void> {
		const settings = this.store.getSettings();
		const folder = normalizeSyncFolder(settings.syncFolder);
		const reserved = new Set<string>();

		const archivePath = await this.resolveManagedPath(
			this.knownArchivePath || settings.archive.filePath,
			buildArchiveNotePath(folder),
			{ kind: 'archive' },
			reserved,
		);
		reserved.add(archivePath.toLocaleLowerCase());

		const nextViews = new Map<ViewKind, KnownView>();
		const nextTargets: Record<ViewKind, { filePath: string }> = {};
		for (const view of this.store.getTaskViews()) {
			const previous =
				this.knownViews.get(view.id)?.path ?? settings.viewSyncTargets[view.id]?.filePath ?? '';
			const path = await this.resolveManagedPath(
				previous,
				buildManagedNotePath(folder, view.title),
				{ kind: 'view', id: view.id },
				reserved,
			);
			reserved.add(path.toLocaleLowerCase());
			nextViews.set(view.id, { title: view.title, path });
			nextTargets[view.id] = { filePath: path };
		}

		for (const [viewId, previous] of this.knownViews) {
			if (nextViews.has(viewId)) continue;
			await this.moveDeletedViewToRecovery(previous, folder, viewId);
		}

		const targetsChanged =
			JSON.stringify(settings.viewSyncTargets) !== JSON.stringify(nextTargets) ||
			settings.archive.filePath !== archivePath ||
			settings.syncFolder !== folder;
		if (targetsChanged) {
			this.store.dispatch({
				type: 'UPDATE_SETTINGS',
				payload: {
					syncFolder: folder,
					viewSyncTargets: nextTargets,
					archive: { filePath: archivePath },
				},
			});
		}
		this.knownViews = nextViews;
		this.knownArchivePath = archivePath;
	}

	private async resolveManagedPath(
		previousRawPath: string,
		baseRawPath: string,
		owner: ManagedOwner,
		reserved: ReadonlySet<string>,
	): Promise<string> {
		const previousPath = previousRawPath ? normalizePath(previousRawPath) : '';
		const previousFile = previousPath ? this.vault.getAbstractFileByPath(previousPath) : null;
		const previousOwned =
			previousFile instanceof TFile && (await this.isManagedBy(previousFile, owner, true));

		const candidate = await this.findAvailablePath(
			normalizePath(baseRawPath),
			owner,
			reserved,
			previousOwned ? previousPath : '',
			!previousPath,
		);
		if (!previousOwned || previousPath === candidate) return candidate;

		const destination = this.vault.getAbstractFileByPath(candidate);
		if (destination instanceof TFile && (await this.isManagedBy(destination, owner, false))) {
			await this.moveManagedFileToRecovery(previousFile, managedNoteTitle(previousPath), owner);
			return candidate;
		}
		if (destination) return previousPath;

		try {
			await this.ensureParentFolder(candidate);
			await this.vault.rename(previousFile, candidate);
			return candidate;
		} catch (error) {
			console.error(`[aulycKanban] Failed to rename managed note ${previousPath}:`, error);
			return previousPath;
		}
	}

	private async findAvailablePath(
		basePath: string,
		owner: ManagedOwner,
		reserved: ReadonlySet<string>,
		previousPath: string,
		allowLegacyAtBase: boolean,
	): Promise<string> {
		for (let ordinal = 1; ordinal <= 999; ordinal += 1) {
			const candidate = buildUniqueManagedNotePath(
				basePath,
				ordinal,
				owner.kind === 'view' ? owner.id : undefined,
			);
			if (reserved.has(candidate.toLocaleLowerCase()) && candidate !== previousPath) continue;
			const existing = this.vault.getAbstractFileByPath(candidate);
			if (!existing || candidate === previousPath) return candidate;
			if (
				existing instanceof TFile &&
				(await this.isManagedBy(existing, owner, allowLegacyAtBase && ordinal === 1))
			)
				return candidate;
		}
		return buildUniqueManagedNotePath(basePath, 1000, owner.kind === 'view' ? owner.id : undefined);
	}

	private async isManagedBy(
		file: TFile,
		owner: ManagedOwner,
		allowLegacy: boolean,
	): Promise<boolean> {
		const content = await this.vault.cachedRead(file);
		const identity =
			owner.kind === 'archive' ? syncMetadata('archive') : syncMetadata('view', owner.id);
		if (content.includes(identity)) return true;
		return allowLegacy && content.includes(SYNC_START) && content.includes(SYNC_END);
	}

	private async moveDeletedViewToRecovery(
		previous: KnownView,
		folder: string,
		viewId: ViewKind,
	): Promise<void> {
		if (!previous.path) return;
		const file = this.vault.getAbstractFileByPath(normalizePath(previous.path));
		if (
			!(file instanceof TFile) ||
			!(await this.isManagedBy(file, { kind: 'view', id: viewId }, true))
		)
			return;
		await this.moveManagedFileToRecovery(
			file,
			previous.title,
			{ kind: 'view', id: viewId },
			folder,
		);
	}

	private async moveManagedFileToRecovery(
		file: TFile,
		title: string,
		owner: ManagedOwner,
		folder = normalizeSyncFolder(this.store.getSettings().syncFolder),
	): Promise<void> {
		const now = new Date();
		const stamp = [
			now.getFullYear(),
			String(now.getMonth() + 1).padStart(2, '0'),
			String(now.getDate()).padStart(2, '0'),
			'-',
			String(now.getHours()).padStart(2, '0'),
			String(now.getMinutes()).padStart(2, '0'),
			String(now.getSeconds()).padStart(2, '0'),
		].join('');
		const base = normalizePath(
			`${folder}/${DELETED_SYNC_FOLDER}/${managedNoteTitle(title)}-${stamp}.md`,
		);
		const recoveryPath = await this.findAvailablePath(base, owner, new Set(), '', false);
		try {
			await this.ensureParentFolder(recoveryPath);
			await this.vault.rename(file, recoveryPath);
		} catch (error) {
			console.error(`[aulycKanban] Failed to recover managed note ${file.path}:`, error);
		}
	}

	private async syncAllViews(silent: boolean): Promise<void> {
		await Promise.all(this.store.getTaskViews().map((view) => this.syncView(view.id, silent)));
	}

	private async syncViews(viewIds: readonly ViewKind[], silent: boolean): Promise<void> {
		await Promise.all(viewIds.map((viewId) => this.syncView(viewId, silent)));
	}

	private async syncView(viewId: ViewKind, silent: boolean): Promise<void> {
		const target = this.store.getSettings().viewSyncTargets[viewId];
		const view = this.store.getView(viewId);
		if (!target?.filePath || !view) return;
		try {
			await this.writeToFile(normalizePath(target.filePath), generateMarkdown(view), silent);
		} catch (error) {
			if (!silent)
				new Notice(`${t('sync.fail')}：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async syncArchive(silent = false): Promise<void> {
		const path = this.store.getSettings().archive?.filePath;
		if (!path) return;
		try {
			await this.writeToFile(
				normalizePath(path),
				`${syncMetadata('archive')}\n${this.generateArchiveMarkdown()}`,
				silent,
			);
		} catch (error) {
			if (!silent)
				new Notice(`${t('sync.fail')}：${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private generateArchiveMarkdown(): string {
		const views = this.store.getTaskViews();
		const total = views.reduce((count, view) => count + this.store.getArchive(view.id).length, 0);
		let markdown = `> ${t('md.syncTime')}：${formatDateTime(new Date())}\n\n`;
		markdown += `## ${t('md.archiveStats')}\n\n- ${t('md.archiveTotal')}：${total}\n`;
		for (const view of views)
			markdown += `- ${view.title}：${this.store.getArchive(view.id).length}\n`;
		markdown += '\n';
		for (const view of views) {
			const tasks = this.store.getArchive(view.id);
			if (tasks.length === 0) continue;
			markdown += `## ${view.title}\n\n${this.renderArchiveByColumn(tasks, view)}`;
		}
		return markdown;
	}

	private renderArchiveByColumn(tasks: Task[], view: TaskView): string {
		const grouped = new Map<string, Task[]>(view.columns.map((column) => [column.id, []]));
		grouped.set(ARCHIVE_UNCATEGORIZED_ID, []);
		for (const task of tasks) {
			const sourceColumnId = task.sourceColumnId;
			const key =
				sourceColumnId && grouped.has(sourceColumnId) ? sourceColumnId : ARCHIVE_UNCATEGORIZED_ID;
			grouped.get(key)?.push(task);
		}
		let markdown = '';
		const render = (title: string, columnTasks: Task[]): void => {
			if (columnTasks.length === 0) return;
			markdown += `### ${title}\n\n`;
			for (const task of [...columnTasks].sort(
				(a, b) => getArchivedAtTime(b) - getArchivedAtTime(a),
			)) {
				const time = formatDateTimeMinute(getArchivedAtIso(task));
				markdown += `- [x] ${task.content}  *(${t('archive.archivedAt')} ${time})*\n`;
			}
			markdown += '\n';
		};
		for (const column of view.columns) render(column.title, grouped.get(column.id) ?? []);
		render(t('archive.other'), grouped.get(ARCHIVE_UNCATEGORIZED_ID) ?? []);
		return markdown;
	}

	private async writeToFile(filePath: string, markdown: string, silent: boolean): Promise<void> {
		const wrapped = `${SYNC_START}\n${markdown}\n${SYNC_END}`;
		const existing = this.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			const content = await this.vault.cachedRead(existing);
			if (this.hasContentOutsideManagedBlock(content)) {
				await this.replaceLegacyNoteWithExactMirror(existing, filePath, wrapped);
			} else {
				await this.vault.process(existing, () => wrapped);
			}
			if (!silent) new Notice(t('sync.updated'));
			return;
		}
		if (existing) throw new Error(`Path is not a Markdown file: ${filePath}`);
		await this.ensureParentFolder(filePath);
		await this.vault.create(filePath, wrapped);
		if (!silent) new Notice(t('sync.exported'));
	}

	private hasContentOutsideManagedBlock(content: string): boolean {
		const normalized = content.trim();
		if (!normalized) return false;
		const start = normalized.indexOf(SYNC_START);
		const end = normalized.lastIndexOf(SYNC_END);
		return start !== 0 || end !== normalized.length - SYNC_END.length;
	}

	private async replaceLegacyNoteWithExactMirror(
		file: TFile,
		originalPath: string,
		wrapped: string,
	): Promise<void> {
		const historyPath = await this.buildPreservedHistoryPath(file.path);
		await this.ensureParentFolder(historyPath);
		await this.vault.rename(file, historyPath);
		try {
			await this.vault.create(originalPath, wrapped);
		} catch (error) {
			if (!this.vault.getAbstractFileByPath(originalPath)) {
				try {
					await this.vault.rename(file, originalPath);
				} catch (rollbackError) {
					console.error(
						`[aulycKanban] Failed to restore ${originalPath} after mirror creation failed:`,
						rollbackError,
					);
				}
			}
			throw error;
		}
	}

	private async buildPreservedHistoryPath(filePath: string): Promise<string> {
		const now = new Date();
		const stamp = [
			now.getFullYear(),
			String(now.getMonth() + 1).padStart(2, '0'),
			String(now.getDate()).padStart(2, '0'),
			'-',
			String(now.getHours()).padStart(2, '0'),
			String(now.getMinutes()).padStart(2, '0'),
			String(now.getSeconds()).padStart(2, '0'),
		].join('');
		const fileName = filePath.slice(filePath.lastIndexOf('/') + 1);
		const folder = normalizeSyncFolder(this.store.getSettings().syncFolder);
		const basePath = normalizePath(
			`${folder}/${PRESERVED_SYNC_FOLDER}/${managedNoteTitle(fileName)}-${stamp}.md`,
		);
		for (let ordinal = 1; ordinal <= 999; ordinal += 1) {
			const candidate = buildUniqueManagedNotePath(basePath, ordinal);
			if (!this.vault.getAbstractFileByPath(candidate)) return candidate;
		}
		throw new Error(`Unable to reserve preserved history path for ${filePath}`);
	}

	private async ensureParentFolder(filePath: string): Promise<void> {
		const directory = filePath.substring(0, filePath.lastIndexOf('/'));
		if (!directory) return;
		let current = '';
		for (const part of directory.split('/').filter(Boolean)) {
			current = current ? `${current}/${part}` : part;
			if (!this.vault.getAbstractFileByPath(current)) await this.vault.createFolder(current);
		}
	}

	flush(): void {
		const pending = this.syncTimeout !== null;
		if (this.syncTimeout) window.clearTimeout(this.syncTimeout);
		this.syncTimeout = null;
		if (pending) void this.flushPending();
	}
}
