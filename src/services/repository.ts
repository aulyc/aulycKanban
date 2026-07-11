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

	constructor(
		loadDataFn: () => Promise<unknown>,
		saveDataFn: (data: PluginData) => Promise<void>,
	) {
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

			const settings: PluginSettings = data['settings']
				? { ...DEFAULT_SETTINGS, ...(data['settings'] as Partial<PluginSettings>) }
				: { ...DEFAULT_SETTINGS };

			const board = migrateBoardData(data['board']);

			settings.schemaVersion = CURRENT_SCHEMA_VERSION;

			return { settings, board };
		} catch (error) {
			console.error('[aulyckanban] Failed to load data, using defaults:', error);
			return {
				settings: { ...DEFAULT_SETTINGS },
				board: getDefaultBoardData(),
			};
		}
	}

	async save(settings: PluginSettings, board: BoardData): Promise<void> {
		try {
			await this.saveDataFn({ settings, board });
		} catch (error) {
			console.error('[aulyckanban] Failed to save data:', error);
		}
	}
}
