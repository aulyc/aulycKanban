import type { BoardData, PluginSettings, PluginData } from '../types';
import { DEFAULT_SETTINGS, getDefaultBoardData, CURRENT_SCHEMA_VERSION } from '../constants';
import { migrateBoardData } from './boardMigration';

/**
 * 数据仓储层
 * 负责数据读取、写入、格式迁移
 */

/**
 * 基于 Obsidian Plugin.loadData/saveData 的仓储实现
 */
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

			if (!raw || typeof raw !== 'object') {
				return {
					settings: { ...DEFAULT_SETTINGS },
					board: getDefaultBoardData(),
				};
			}

			const data = raw as Record<string, unknown>;

			const rawSettings =
				data['settings'] && typeof data['settings'] === 'object'
					? (data['settings'] as Record<string, unknown>)
					: {};
			const rawTargets =
				rawSettings['viewSyncTargets'] && typeof rawSettings['viewSyncTargets'] === 'object'
					? (rawSettings['viewSyncTargets'] as PluginSettings['viewSyncTargets'])
					: {};
			const legacyWork = rawSettings['work'] as { filePath?: string } | undefined;
			const legacyPersonal = rawSettings['personal'] as { filePath?: string } | undefined;
			const rawArchive =
				rawSettings['archive'] && typeof rawSettings['archive'] === 'object'
					? (rawSettings['archive'] as PluginSettings['archive'])
					: undefined;
			const rawAggregate =
				rawSettings['aggregate'] && typeof rawSettings['aggregate'] === 'object'
					? (rawSettings['aggregate'] as PluginSettings['aggregate'])
					: undefined;
			const hasLegacySyncPath =
				Object.values(rawTargets).some((target) => Boolean(target?.filePath?.trim())) ||
				Boolean(legacyWork?.filePath?.trim()) ||
				Boolean(legacyPersonal?.filePath?.trim()) ||
				Boolean(rawArchive?.filePath?.trim());
			const rawSyncMode = rawSettings['syncMode'];
			const syncMode =
				rawSyncMode === 'aggregate' || rawSyncMode === 'per-view'
					? rawSyncMode
					: hasLegacySyncPath
						? 'per-view'
						: 'aggregate';
			const settings: PluginSettings = {
				...DEFAULT_SETTINGS,
				...(rawSettings as Partial<PluginSettings>),
				syncMode,
				aggregate: {
					...DEFAULT_SETTINGS.aggregate,
					...rawAggregate,
				},
				viewSyncTargets: {
					work: {
						filePath: legacyWork?.filePath ?? DEFAULT_SETTINGS.viewSyncTargets.work?.filePath ?? '',
					},
					personal: {
						filePath:
							legacyPersonal?.filePath ?? DEFAULT_SETTINGS.viewSyncTargets.personal?.filePath ?? '',
					},
					...rawTargets,
				},
				archive: {
					...DEFAULT_SETTINGS.archive,
					...rawArchive,
				},
			};

			const board = migrateBoardData(data['board']);
			for (const view of board.views) settings.viewSyncTargets[view.id] ??= { filePath: '' };

			settings.schemaVersion = CURRENT_SCHEMA_VERSION;

			return { settings, board };
		} catch (error) {
			console.error('[aulycKanban] Failed to load data, using defaults:', error);
			return {
				settings: { ...DEFAULT_SETTINGS },
				board: getDefaultBoardData(),
			};
		}
	}

	async save(settings: PluginSettings, board: BoardData): Promise<void> {
		await this.saveDataFn({ settings, board });
	}
}
