import type { BoardData, PluginSettings, PluginData } from '../types';
import { DEFAULT_SETTINGS, getDefaultBoardData, CURRENT_SCHEMA_VERSION } from '../constants';
import { migrateBoardData } from './boardMigration';

/**
 * 数据仓储层
 * 负责数据读取、写入、格式迁移
 */

/** 数据仓储接口 */
export interface IBoardRepository {
	load(): Promise<{ settings: PluginSettings; board: BoardData }>;
	save(settings: PluginSettings, board: BoardData): Promise<void>;
}

/**
 * 基于 Obsidian Plugin.loadData/saveData 的仓储实现
 */
export class PluginDataRepository implements IBoardRepository {
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
		const raw = await this.loadDataFn();

		if (!raw || typeof raw !== 'object') {
			return {
				settings: { ...DEFAULT_SETTINGS },
				board: getDefaultBoardData(),
			};
		}

		const data = raw as Record<string, unknown>;

		// 解析设置
		const settings: PluginSettings = data['settings']
			? { ...DEFAULT_SETTINGS, ...(data['settings'] as Partial<PluginSettings>) }
			: { ...DEFAULT_SETTINGS };

		// 解析看板数据（含旧格式迁移）
		const board = migrateBoardData(data['board']);

		// 更新 schema 版本
		settings.schemaVersion = CURRENT_SCHEMA_VERSION;

		return { settings, board };
	}

	async save(settings: PluginSettings, board: BoardData): Promise<void> {
		await this.saveDataFn({ settings, board });
	}
}
