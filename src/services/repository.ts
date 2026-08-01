import type { BoardData, PluginSettings, PluginData, SyncTarget } from '../types';
import { DEFAULT_SETTINGS, getDefaultBoardData, CURRENT_SCHEMA_VERSION } from '../constants';
import { folderFromFilePath, normalizeSyncFolder } from '../utils/noteSync';
import { migrateBoardData } from './boardMigration';

/** 基于 Obsidian Plugin.loadData/saveData 的数据仓储。 */
export class PluginDataRepository {
	private readonly loadDataFn: () => Promise<unknown>;
	private readonly saveDataFn: (data: PluginData) => Promise<void>;

	constructor(loadDataFn: () => Promise<unknown>, saveDataFn: (data: PluginData) => Promise<void>) {
		this.loadDataFn = loadDataFn;
		this.saveDataFn = saveDataFn;
	}

	async load(): Promise<{ settings: PluginSettings; board: BoardData }> {
		try {
			const raw = await this.loadDataFn();
			if (!raw || typeof raw !== 'object') return this.defaults();

			const data = raw as Record<string, unknown>;
			const rawSettings = this.record(data['settings']);
			const rawTargets = this.record(rawSettings['viewSyncTargets']);
			const legacyWork = this.syncTarget(rawSettings['work']);
			const legacyPersonal = this.syncTarget(rawSettings['personal']);
			const rawArchive = this.syncTarget(rawSettings['archive']);
			const rawAggregate = this.syncTarget(rawSettings['aggregate']);
			const board = migrateBoardData(data['board']);

			const viewSyncTargets: Record<string, SyncTarget> = {
				work: legacyWork ?? {
					filePath: DEFAULT_SETTINGS.viewSyncTargets.work?.filePath ?? '',
				},
				personal: legacyPersonal ?? {
					filePath: DEFAULT_SETTINGS.viewSyncTargets.personal?.filePath ?? '',
				},
			};
			for (const [viewId, target] of Object.entries(rawTargets)) {
				const parsed = this.syncTarget(target);
				if (parsed) viewSyncTargets[viewId] = parsed;
			}
			for (const view of board.views) viewSyncTargets[view.id] ??= { filePath: '' };

			const configuredFolder =
				typeof rawSettings['syncFolder'] === 'string'
					? normalizeSyncFolder(rawSettings['syncFolder'])
					: '';
			const perViewPaths = [
				...Object.values(viewSyncTargets).map((target) => target.filePath),
				rawArchive?.filePath ?? '',
			];
			const aggregatePath = rawAggregate?.filePath ?? '';
			const legacyFolder = (
				rawSettings['syncMode'] === 'aggregate'
					? [aggregatePath, ...perViewPaths]
					: [...perViewPaths, aggregatePath]
			)
				.map(folderFromFilePath)
				.find(Boolean);

			const settings: PluginSettings = {
				currentView:
					typeof rawSettings['currentView'] === 'string'
						? rawSettings['currentView']
						: DEFAULT_SETTINGS.currentView,
				activeColumnId:
					typeof rawSettings['activeColumnId'] === 'string'
						? rawSettings['activeColumnId']
						: DEFAULT_SETTINGS.activeColumnId,
				showArchive:
					typeof rawSettings['showArchive'] === 'boolean'
						? rawSettings['showArchive']
						: DEFAULT_SETTINGS.showArchive,
				syncFolder: configuredFolder || legacyFolder || DEFAULT_SETTINGS.syncFolder,
				viewSyncTargets,
				archive: rawArchive ?? { ...DEFAULT_SETTINGS.archive },
				schemaVersion: CURRENT_SCHEMA_VERSION,
				saveDebounce:
					typeof rawSettings['saveDebounce'] === 'number'
						? rawSettings['saveDebounce']
						: DEFAULT_SETTINGS.saveDebounce,
				syncDebounce:
					typeof rawSettings['syncDebounce'] === 'number'
						? rawSettings['syncDebounce']
						: DEFAULT_SETTINGS.syncDebounce,
				autoCheckUpdates:
					typeof rawSettings['autoCheckUpdates'] === 'boolean'
						? rawSettings['autoCheckUpdates']
						: DEFAULT_SETTINGS.autoCheckUpdates,
			};

			return { settings, board };
		} catch (error) {
			console.error('[aulycKanban] Failed to load data, using defaults:', error);
			return this.defaults();
		}
	}

	async save(settings: PluginSettings, board: BoardData): Promise<void> {
		await this.saveDataFn({ settings, board });
	}

	private defaults(): { settings: PluginSettings; board: BoardData } {
		return {
			settings: {
				...DEFAULT_SETTINGS,
				viewSyncTargets: Object.fromEntries(
					Object.entries(DEFAULT_SETTINGS.viewSyncTargets).map(([id, target]) => [
						id,
						{ ...target },
					]),
				),
				archive: { ...DEFAULT_SETTINGS.archive },
			},
			board: getDefaultBoardData(),
		};
	}

	private record(value: unknown): Record<string, unknown> {
		return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	}

	private syncTarget(value: unknown): SyncTarget | undefined {
		const target = this.record(value);
		return typeof target['filePath'] === 'string'
			? { filePath: target['filePath'].trim() }
			: undefined;
	}
}
